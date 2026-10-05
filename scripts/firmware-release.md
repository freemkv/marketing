# Firmware finder release

The existing Pages workflow accepts an optional `firmware_release` tag. A firmware
release uploads and publicly verifies every staged tar before building download
links into the site. A site-only release uses the already committed catalog.

## MediaTek feature data (run before `prepare`)

`src/data/firmware-features.json`, `firmware-index.json` and
`firmware-features-summary.md` are generated, never hand-edited. Regenerate them
whenever the hoard or the freemkv-fw engine changes, before `prepare` (which
reads `firmware-index.json` as a legacy input):

```
node scripts/firmware-features.mjs /path/to/hoard.v3 --fw /path/to/freemkv-fw
```

Inputs: a v3 hoard (`index/identities.json`, `index/sources.json`, `images/...`)
and the `freemkv-fw` binary (`--fw` or env `FREEMKV_FW`; build with
`cargo build --release` in freemkv-firmware). Optional: `--out-dir` (default
`src/data`), `--jobs`, and `--hardware-verified allowlist.json` (JSON array of
sha256 proven on hardware; default none, so everything is `build-verified`).

An image is listed only if it is not MK-patched, no source name contains
"omnidrive", it is not a fragment, and `freemkv-fw create --json` applies at
least one lever. Flags follow engine lineage (see the header of the script).
Review the diff before committing: counts, base_facts and r2 keys come straight
from the engine. Tests: `node --test scripts/*.test.mjs`.

Prepare from the v3 identity hoard (no upload):

```
node scripts/firmware-release.mjs prepare /path/to/firmware-extractor /tmp/firmware-assets /path/to/hoard.v3
node --test scripts/*.test.mjs
```

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
`firmware-index.json` and `payloads/fw/<family>/<sha256>.<tar|bin>`. Objects are
content-addressed, so each package is uploaded once whatever its names.

On an isolated release branch, commit the staged `finder-catalog.json`,
`legacy-keys.json` and `firmware-index.json` into `src/data` (publish copies the
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
validates its archive members and hashes, uploads to `freemkv-firmware`, verifies
public GET contents, then builds and deploys Pages project `freemkv` on that branch (QA is a preview).
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
