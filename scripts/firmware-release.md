# Firmware finder release

The existing Pages workflow accepts an optional `firmware_release` tag. A firmware
release uploads and publicly verifies every staged tar before building download
links into the site. A site-only release uses the already committed catalog.

## Routine updates

Run `npm run firmware:release -- EXTRACTOR STAGE [V3_HOARD]` for new firmware.
This ingests new inputs, reuses existing extraction records and unchanged package
assembly, recomputes indexes (including changed curated pairings), and stages the
complete release. The upload archive contains only payloads absent from the
checkout's current catalogue. CI verifies reused objects from R2, assembles the
full archive there, and updates `/fw/latest.tar.gz` on every firmware release.
It requires `FWEXT`, or Cargo, plus `FREEMKV_CROSSFLASH` and `FREEMKV_FW` as below.

Use `--refresh` only when deliberately re-extracting every stored original,
for example after an extractor change that needs to be applied to older inputs.
Normal releases retain the same package admission, crossflash, upload and hash
verification checks. They still replace the complete `/fw/latest.tar.gz` archive.

## MediaTek feature data (run before `prepare`)

`src/data/firmware-features.json`, `firmware-index.json` and
`firmware-features-summary.md` are generated, never hand-edited. Regenerate them
whenever the hoard or the freemkv-fw engine changes, before `prepare` (which
reads `firmware-index.json` as a legacy input):

```
node scripts/firmware-features.mjs /path/to/firmware-extractor/hoard --fw /path/to/freemkv-fw
```

Inputs: the firmware-extractor hoard (`index/identities.json`, `index/sources.json`, `images/...`)
and the `freemkv-fw` binary (`--fw` or env `FREEMKV_FW`; build with
`cargo build --release` in freemkv-firmware). Optional: `--out-dir` (default
`src/data`), `--jobs`, and `--hardware-verified allowlist.json` (JSON array of
sha256 proven on hardware; default none, so everything is `build-verified`).

An image is listed when it is not MK-patched, no source name contains
"omnidrive", it is not a fragment, and `freemkv-fw create --json` reports its
model and revision. Every such image is published: one where `create` applies at
least one lever is `modifiable` (the Finder shows the Modifiable pill and leads
to the modify page); any other leads to the flash page, like Pioneer. Flags
follow engine lineage (see the header of the script).
Review the diff before committing: counts, base_facts and r2 keys come straight
from the engine. Tests: `node --test scripts/*.test.mjs`.

Prepare from the firmware-extractor hoard (no upload):

```
node scripts/firmware-release.mjs prepare /path/to/firmware-extractor /tmp/firmware-assets /path/to/firmware-extractor/hoard
node --test scripts/*.test.mjs
```

`prepare` also needs `FREEMKV_CROSSFLASH`: the `freemkv-crossflash` binary from
freemkv-firmware (`cargo build --release -p freemkv-flash --bin freemkv-crossflash`).
It runs the flasher's own offline gates and writes `crossflash-links.json`
(installed sha256 -> target sha256s) into the
stage; `prepare` checks every link names a catalogue package. The finder lists
exactly these links, so it never re-implements the crossflash rule. Diagnose
one pair with `freemkv-crossflash --why <installed> <target>`.

The complete graph cache lives at `<hoard>/cache/website-crossflash.json`
(`FIRMWARE_CROSSFLASH_CACHE` overrides it). It is bound to the SHA-256 of the
actual flasher executable and every package's actual bytes. With the same
engine, additions check both directions against every package of that platform;
unchanged pairs retain their exact Yes/Future/refusal result. Removals prune
edges. Engine changes or a missing cache run the full scan. A corrupt cache
stops preparation; remove it to request a full scan. Partial scans never replace
the last complete cache. Keep the validated executable between releases instead
of rebuilding it unnecessarily.

To migrate an already completed full scan, explicitly seed from its stage using
the **exact executable that produced it** (never a matching version number):

```
FREEMKV_CROSSFLASH=/path/to/that/executable node scripts/firmware-release.mjs seed-crossflash-cache /tmp/validated-stage /path/to/hoard/cache/website-crossflash.json
```

Only use this for a stage whose full scan completed successfully. Normal releases
maintain the cache automatically.

The third argument defaults to `<extractor>/hoard`. `prepare` runs
`cargo run --release --bin fwext -- publish-catalog` in the extractor (set
`FWEXT=/path/to/fwext` to use a prebuilt binary) with the site's current
`pioneer-firmware-index.json`, `firmware-index.json` and
`firmware-withdrawals.json` as legacy inputs. fwext re-inspects every Pioneer
package (envelopes, inventory, Kernel selection, provenance) and writes the
stage; `prepare` then re-validates it (manifest v2, catalogue/object/filename
agreement, withdrawn Normal hashes, every legacy key resolving to the same
bytes, payload hashes) and creates `/tmp/firmware-assets.tar.gz` containing
`publish-manifest.json` (v2), `finder-catalog.json`, `legacy-keys.json`,
`crossflash-links.json`, `transport.json` and only new/changed
`payloads/fw/<family>/<sha256>.<tar|bin>` objects. Objects are
content-addressed, so each package is uploaded once whatever its names.

On an isolated release branch, commit the staged `finder-catalog.json`,
`legacy-keys.json`, `firmware-index.json` and `crossflash-links.json` into `src/data` (publish copies the
same three after verification). Keep `pioneer-firmware-index.json`: the Finder
hides its entries whose hash is in the v2 catalogue, and the download function
uses it so old links keep resolving. MediaTek files without hoard bytes stay on
their existing `MT1939/`/`MT1959/` keys (legacy status `missing-bytes`); keep
those objects. Do not push main until the firmware release is ready: an
ordinary main push deploys immediately.

v1 staged archives (`freemkv-firmware-publish-v1`) can still be extracted and
published.

Create a draft GitHub release containing the staging archive named exactly
`firmware-assets.tar.gz`. Dispatch the Pages workflow from the isolated release
branch with `firmware_release` set to that draft tag. It downloads the asset,
validates its archive members and hashes, retrieves omitted content-addressed
objects from the fixed R2 bucket and verifies their complete hashes and sizes,
uploads new objects to `freemkv-firmware`, verifies GET contents, then builds and
deploys Pages project `freemkv` on that branch (QA is a preview). Missing or
corrupt reused objects stop deployment. Add `--full-upload` to `release` or
`prepare` if intentionally repairing missing old objects. That sends all payloads
without forcing extraction or invalidating valid compatibility results.
After QA verification succeeds, fast-forward/merge the reviewed release into main;
the resulting ordinary deployment uses the same published catalogs.

The workflow requires `CLOUDFLARE_ACCOUNT_ID` for the FreeMKV account and
`CLOUDFLARE_API_TOKEN` with both R2 object write and Pages edit permission. Local
Wrangler's default account is deliberately not used by the publish command.
A failure in any upload or public checksum comparison aborts before Pages deploy.

The MediaTek feature index is preserved from the website checkout and joined to
catalogue images by sha256. MediaTek images are published from hoard bytes only
when they are already on the site's allowlist.

Example release commands after preparing and committing the isolated branch:

```
gh release create firmware-catalog-YYYYMMDD /tmp/firmware-assets.tar.gz --repo freemkv/marketing --draft --title 'Firmware catalog YYYY-MM-DD' --notes 'Staged firmware publication assets'
gh workflow run pages.yml --repo freemkv/marketing --ref qa -f firmware_release=firmware-catalog-YYYYMMDD
gh run list --repo freemkv/marketing --workflow pages.yml
```

Publication uses four concurrent upload/verification workers and a pinned
Wrangler 4.143.0 installed once by CI. Objects already publicly matching the
manifest's complete SHA-256 and size are skipped, allowing safe workflow reruns.
After upload, public verification retries four times for transient visibility
failures; any persistent failure prevents deployment. The workflow timeout is
30 minutes.
Publication naming keeps source paths and embedded identities unchanged. It expands complete model lists and explicit OEM suffix notation, restores product-prefix separators, and uses identical Normal payloads within the same source label as evidence for synthetic images. Model-specific branches were removed from the installer. Hash-bound SOURCE_PROVENANCE.json receipts capture the two legacy DVR source-label ambiguities; a versioned receipt copy is internal/pioneer-source-provenance.json. These receipts are private research metadata and never enter public installer tars.

The release workflow assembles and retains the full staging archive at R2 key
`releases/latest.tar.gz`, using multipart upload and complete downloaded SHA-256
verification. `/fw/latest.tar.gz` serves that object directly with no indexing
or site link. After successful deployment, the temporary GitHub release asset
is deleted; the latest R2 archive is exempt from orphan pruning.

The full archive includes all manifest payloads and excludes transport metadata
and unrelated staging files. It remains independently extractable/publishable.
To assemble one locally when needed: `node scripts/firmware-release.mjs archive
STAGE FULL.tar.gz`.

Pages publishes with `--keep-existing` so QA publication cannot delete firmware
objects still linked by the production catalogue. Orphan cleanup is a separate
operation after production has switched catalogues.
