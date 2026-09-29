# Firmware finder release

The existing Pages workflow accepts an optional `firmware_release` tag. A firmware
release uploads and publicly verifies every staged tar before building download
links into the site. A site-only release uses the already committed catalog.

Prepare from the canonical hoard (no upload):

```
node scripts/firmware-release.mjs prepare /path/to/firmware-extractor /tmp/firmware-assets
node --test scripts/firmware-release.test.mjs
```

The staging directory must not already exist. This invokes the Rust
`pioneer-finder-index` validator, preserves model/hardware/advertised version,
and creates `/tmp/firmware-assets.tar.gz`. The archive has the two website
catalogs, a publish manifest, and unchanged installer tars. Source provenance
is not inserted into distributed firmware tars.

On an isolated release branch based on production main, commit the staged
`pioneer-firmware-index.json` and `firmware-index.json` into `src/data` alongside
the finder/publisher changes. This keeps future site builds consistent. Do not
push main until the firmware release is ready: an ordinary main push deploys
immediately.

Create a draft GitHub release containing the staging archive named exactly
`firmware-assets.tar.gz`. Dispatch the Pages workflow from the isolated release
branch with `firmware_release` set to that draft tag. It downloads the asset,
validates its archive members and hashes, uploads to `freemkv-firmware`, verifies
public GET contents, then builds and deploys Pages project `freemkv` to production.
After that workflow succeeds, fast-forward/merge the reviewed release into main;
the resulting ordinary deployment uses the same published catalogs.

The workflow requires `CLOUDFLARE_ACCOUNT_ID` for the FreeMKV account and
`CLOUDFLARE_API_TOKEN` with both R2 object write and Pages edit permission. Local
Wrangler's default account is deliberately not used by the publish command.
A failure in any upload or public checksum comparison aborts before Pages deploy.

The MediaTek index is preserved from the website checkout; its existing public
links must be checked separately before staging. This release tool does not
reconstruct MediaTek firmware from an incomplete source corpus.

Optional fourth argument to `prepare`: a JSON array of `{key,path,sha256,bytes}`
for verified MediaTek objects requiring restoration. Keys must be
`MT1939/<name>.bin` or `MT1959/<name>.bin`, and each must appear in the staged
MediaTek catalog. Those objects receive the same upload and public verification.

Example release commands after preparing and committing the isolated branch:

```
gh release create firmware-catalog-YYYYMMDD /tmp/firmware-assets.tar.gz --repo freemkv/marketing --draft --title 'Firmware catalog YYYY-MM-DD' --notes 'Staged firmware publication assets'
gh workflow run pages.yml --repo freemkv/marketing --ref firmware-finder-release -f firmware_release=firmware-catalog-YYYYMMDD
gh run list --repo freemkv/marketing --workflow pages.yml
```

Publication uses four concurrent upload/verification workers and a pinned
Wrangler 4.143.0 installed once by CI. Objects already publicly matching the
manifest's complete SHA-256 and size are skipped, allowing safe workflow reruns.
After upload, public verification retries four times for transient visibility
failures; any persistent failure prevents deployment. The workflow timeout is
30 minutes.
