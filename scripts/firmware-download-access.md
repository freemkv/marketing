# Private firmware download migration

Prepared locally, **not enabled or deployed**. Existing public downloads remain
unchanged unless `PUBLIC_FIRMWARE_TURNSTILE_SITEKEY` is set at build time.

When enabled, clicking Download in the Finder runs a managed Turnstile
challenge, posts `{package: <sha256>, token}` to `/api/firmware-download`, and
saves the returned bytes. The Pages Function validates the token server-side
(including hostname and action), resolves the package hash through the exact
catalogue allowlist (sha256 -> R2 key + catalogue filename), then streams the
private R2 object with
`Content-Disposition` set to the catalogue filename. Old clients posting
`{file: <legacy key>}` still work: legacy `pioneer/...` and `MT1939/...` keys
resolve through the v1 site indexes and `src/data/legacy-keys.json` to the
same sha256, and only to the bytes they were published with. Plain
GET/direct links to this endpoint receive 405; missing or failed tokens get 403.
There is no public fallback on validation failure and no privileged browser key.

This prevents permanent public bucket URLs and basic curl requests. It **cannot
guarantee “no curl”**: anyone who legitimately obtains a valid challenge token
can submit it from another client once, and anyone who downloads a file can
redistribute it. Origin and CORS alone do not authenticate a user. Turnstile
reduces automation; it is not a login or a download quota. Configure a Cloudflare
WAF rate limit on the POST endpoint if quotas/abuse controls are desired; those
account/plan settings have not been inspected or changed.

## Download availability

There is no daily download quota. Every download still requires a valid
Turnstile token and a package in the catalogue allowlist. No KV storage or
per-IP counters are needed.

## Configuration and order

1. Create a managed Turnstile widget restricted to `freemkv.org` and the explicit
   QA hostname `qa.freemkv.pages.dev`. Do not use the always-pass test key live.
2. In the Pages project `freemkv`, add R2 binding `FIRMWARE_BUCKET` pointing to
   `freemkv-firmware`, and secret `FIRMWARE_TURNSTILE_SECRET`, for preview and
   production. Do not expose the secret as a build variable.
3. Set GitHub repository variable `PUBLIC_FIRMWARE_TURNSTILE_SITEKEY` to the
   widget's public site key; the GitHub Actions build consumes it. Pages build
   settings alone do not affect this externally-built site.
4. Set GitHub repository variable `FIRMWARE_R2_ACCESS=private`. Publication and
   withdrawal verification then use authenticated R2 REST GET rather than the
   public `r2.dev` hostname. Existing CI account/token must have object read as
   well as write permission. Full size/SHA-256 checks remain unchanged.
5. Deploy QA while the bucket remains public. In a real browser download a
   MediaTek BIN and Pioneer TAR and compare SHA-256 to catalogue. Test expiry,
   repeated downloads, denied challenges, and retry after a temporary failure.
   Verify a CI firmware publish against the authenticated read path. Local unit
   tests and builds are not a substitute for these service integration checks.
6. Deploy the same reviewed Finder/Function code to production and verify both
   download types there. Then disable **all** public R2 access: `r2.dev` and any
   public custom bucket domains. Retest old public URLs fail and the website
   still downloads matching bytes. No bucket setting has been changed yet.

Rollback: before public access is disabled, revert to the old site if needed.
After it is disabled, restore the last working protected deployment; reverting
to direct-link Finder code would require deliberately reopening public R2.

## Impact and validation

- Current CLI source searches in `freemkv-firmware` and `freemkv` found no
  references to this R2 hostname. Flash/modify still consume user-supplied local
  files. Saved public URLs and external scripts will intentionally stop working.
- The public catalogue still exposes firmware names/hashes, not usable object
  URLs; these are not secret. Only listed catalogue files can be requested.
- The handler streams R2 to the browser. The browser buffers the small firmware
  blob to save it; no persistent signed URL, cookies, or per-download database.
- Missing bindings/secrets fail closed with 503. Turnstile outage returns a retry
  message; it does not silently reopen the bucket.
- Current protected flow does not offer HTTP Range/resume. Retry makes a fresh
  challenge/download. This is appropriate for the present small firmware files.

Tests: `node --test scripts/*.test.mjs`; build normal and protected mode
with `PUBLIC_FIRMWARE_TURNSTILE_SITEKEY=1x00000000000000000000AA npm run build`.
That site key is Cloudflare's test key, only for local/QA test builds.

Official references checked 2026-09-30:
- https://developers.cloudflare.com/pages/functions/bindings/#r2-buckets
- https://developers.cloudflare.com/r2/buckets/public-buckets/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
- https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/get/
