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

## MediaTek capability data

`prepare` queries the real Modify planner for every exact final MediaTek image
hash in its staged catalog. It builds and structurally audits every supported
output, compares its hash with the preview, and asks Flash to admit the result.
No image is silently dropped when modification is unavailable.

The stage carries `firmware-capabilities.json`, `firmware-index.json`,
`firmware-features.json` and `firmware-features-summary.md` with its catalog and
crossflash graph. The capability records bind both the input hash and the actual
Modify executable hash, including different builds of the same version. Missing,
duplicate, stale or inconsistent records stop preparation/publication. The Find
and Firmware page builds enforce the same coverage contract.

A feature is shown only when the exact image's real boot-settings capability
reports it available and the generated output passes Flash admission. Lineage,
model, silicon label and native disc support do not grant modification features.
Software build checks do not establish physical drive validation.

Production deployment additionally checks the capability producer against the
latest stable freemkv-firmware release. Its exact executable SHA-256 must match
a published standalone Modify CLI asset; a locally rebuilt binary with the same
version is insufficient. Generate production capability data with the released
executable after the app release. Dev CI may validate development data without
publishing it. Missing release metadata or checksums stop deployment.

For a site-only capability refresh against the existing published inventory:

```
node scripts/firmware-features.mjs /path/to/firmware-extractor/hoard --fw /path/to/freemkv-fw \
  --flash /path/to/freemkv-crossflash --eligible-catalog src/data/finder-catalog.json
```

This updates generated files in `src/data`. Use `--out-dir` to stage elsewhere.
Review the diff and run `npm run test:firmware` and `npm run build`. Do not
hand-edit the generated feature bits or capability records.

Released Modify 0.15.3 predates the `capabilities` command. For that interface,
the generator runs the released `modify --json --audit` executable and probes
each advertised boot-setting choice with its real dry-run command. A refused
input remains listed with its hash-bound hoard identity, the refusal reason and
no modification features. Hoard identity supplies labels only. Newer released
versions use their native `capabilities` report and compare it with an audited
build as above. Both paths retain the exact released executable checksum.

The MediaTek `media` marker is not shown as a physical BD/UHD badge. It does not
establish hardware capability. BD/UHD modification pills come only from the
released modifier's per-image `unrestricted.supported` result and Flash admission.

Prepare from the firmware-extractor hoard (no upload):

```
node scripts/firmware-release.mjs prepare /path/to/firmware-extractor /tmp/firmware-assets /path/to/firmware-extractor/hoard
node --test scripts/*.test.mjs
```

`prepare` requires `FREEMKV_FW` and `FREEMKV_CROSSFLASH`: the `freemkv-crossflash` binary from
freemkv-firmware (`cargo build --release -p freemkv-flash --bin freemkv-crossflash`).
It runs the flasher's own offline gates and writes `crossflash-links.json`
(installed sha256 -> target sha256s) into the
stage; `prepare` checks every link names a catalogue package. The finder lists
exactly these links, so it never re-implements the crossflash rule. Diagnose
one pair with `freemkv-crossflash --why <installed> <target>`.

The graph records `evaluated_packages`, including packages with no admitted
routes. The production finder build requires this inventory to match every
release package in the catalog. Replacing, adding or removing a package without
regenerating the graph stops the build; filtering old edges is insufficient.
The graph and catalog must come from the same completed `prepare` stage.
After publication, verify the full archive as well as the finder and individual
downloads: a site-only deployment does not refresh `/fw/latest.tar.gz`.

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
`crossflash-links.json`, the four capability/feature files above, `transport.json` and only new/changed
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

The publication CLI requires complete `origin_details` in the authoritative v2
catalog. Legacy filename-based download requests are rejected; the API accepts
only an approved package SHA-256. The remaining legacy key map is migration audit
metadata and does not grant download access.

Every component must be OEM or an exact-hash approved dump. MK, OmniDrive,
reconstructed, downgrade-enabled and otherwise unverified sources are excluded
unless a dump has explicit publication approval. An old FreeMKV publication is
not independent OEM provenance. Firmware bytes are deduplicated by SHA-256;
original containers retain their separate filenames and hashes. `fwext` emits
the recommended package using pairing completeness, OEM origin and updater
provenance; the website does not choose by hash ordering.

The Find page expands **Origin Details** with SHA-256 and MD5 for the original
EXE/archive and all extracted BINs or Pioneer Kernel/Normal envelopes. Displayed
hashes are calculated from the exact held bytes. Missing or mismatched component
provenance blocks release preparation and site builds.

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

Publication uses eight concurrent upload/verification workers and a pinned
Wrangler 4.143.0 installed once by CI. Objects already publicly matching the
manifest's complete SHA-256 and size are skipped, allowing safe workflow reruns.
After upload, public verification retries four times for transient visibility
failures; any persistent failure prevents deployment. The workflow timeout is
30 minutes.
Publication naming keeps source paths and embedded identities unchanged. It expands complete model lists and explicit OEM suffix notation, restores product-prefix separators, and uses identical Normal payloads within the same source label as evidence for synthetic images. Model-specific branches were removed from the installer. Hash-bound SOURCE_PROVENANCE.json receipts capture the two legacy DVR source-label ambiguities; a versioned receipt copy is internal/pioneer-source-provenance.json. These receipts are private research metadata and never enter public installer tars.

After Pages deployment, a separate maintenance job assembles and retains the full staging archive at R2 key
`releases/latest.tar.gz`, using multipart upload and complete downloaded SHA-256
verification. `/fw/latest.tar.gz` serves that object directly with no indexing
or site link. After successful archive retention, the temporary GitHub release asset
is deleted; the latest R2 archive is exempt from orphan pruning.

The full archive includes all manifest payloads and excludes transport metadata
and unrelated staging files. It remains independently extractable/publishable.
To assemble one locally when needed: `node scripts/firmware-release.mjs archive
STAGE FULL.tar.gz`.

Pages publishes with `--keep-existing` so QA publication cannot delete firmware
objects still linked by the production catalogue. Orphan cleanup is a separate
operation after production has switched catalogues.

Site deployment depends on complete per-object SHA-256 verification, not on full-archive retention. The archive job independently materializes the verified inventory and serializes writers across all branches with `firmware-archive-latest`; it never cancels an active archive upload. Pages concurrency is scoped to each deployment branch, so preview maintenance cannot hold up production. A failed archive job remains visible as a failed workflow and can be rerun without rolling back a verified site.

Full-archive verification reads ordered 16 MiB ranges with at most four requests in flight. Each request is conditional on the captured object ETag and must return the exact requested range and length. Interrupted ranges retry independently; the complete downloaded SHA-256 must still match the local archive.
