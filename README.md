# freemkv.org

Source for the [freemkv.org](https://freemkv.org) website — an Astro + Starlight site
(landing splash + docs), deployed to Cloudflare Pages.

## Local development

```bash
npm install
npm run dev       # local dev server
npm run build     # production build -> dist/
npm run preview   # preview the built site
```

## Firmware finder data

Release packages with `npm run firmware:prepare -- /path/to/firmware-extractor /tmp/firmware-assets`.
The [release workflow](scripts/firmware-release.md) uploads and verifies firmware before deploying QA, then main.
Counts, download links, modification features, and the next step come from the generated indexes.
Only downloadable versions appear in the finder.

`src/data/firmware-index.json` is the existing MediaTek catalog. Its generator is
`../freemkv-private/scripts/publish-firmware.py`; that script now targets this
`marketing` directory. The page also reads `src/data/pioneer-firmware-index.json`.
Build the latter from structurally complete Pioneer installer packages with:

```bash
cargo run --manifest-path ../../firmware-extractor/Cargo.toml --features internal-tools \
  --bin pioneer-finder-index -- /path/to/hoard/installers/pioneer \
  --output src/data/pioneer-firmware-index.json
```

The importer reads only active rows from the packager's
`hoard/installers/pioneer/INDEX.json`; stale tar files are ignored. Each active
installer tar contains one Normal envelope and may contain one Kernel envelope.
The tar has no manifest. The importer verifies the tar hash, member inventory,
envelope headers and hashes against the local `INDEX.json` sidecar. That local
index also records source downloads and selection evidence; source paths and
source package hashes are omitted from the public website JSON. Source-contained,
carried-forward, and Normal-only packages are shown with their actual component
inventory.
Entries remain unhosted until a JSON map of the package SHA-256 to an already
published R2 object key is supplied with `--published map.json`. Example:

```json
{"<package sha256>": "pioneer/BDR-UD04/SAT-8A10/1.14/package.installer.tar"}
```

The site lists a package as downloadable only when that map provides its key.
This is an inventory/hosting state, not a hardware flash-test claim. The
importer does not upload or deploy anything.
The current index uses the packager's source-backed public model. Its embedded
model is preserved separately. Explicit combined source labels are expanded into separate public models.
Generic family folders use the exact model named in an OEM updater filename
when available; original source references remain in the local hoard. Ambiguous
labels stay unchanged, and matching hardware alone does not establish compatibility.

Pioneer `rev` is the advertised release label (for example `1.01EU`), while
`embeddedRev` is the envelope's revision (`1.01`). The finder displays every
release emitted by the extractor without hash-only filtering. Regional labels
remain distinct even when the downloadable tars have identical bytes.

## Structure

- `src/pages/index.astro` — landing splash (hero + Download CTA + feature cards);
  a standalone page outside the Starlight docs collection
- `src/content/docs/docs/*.md` — documentation pages (Overview, Install, Components,
  freemkv-library, AACS, Decryption Keys, License, and more)
- `astro.config.mjs` — site config: title, logo, theme, and the docs sidebar
- `src/assets/` — logo/icon SVGs used in the UI
- `public/` — static files served at the site root: `CNAME` (freemkv.org),
  `.nojekyll`, favicon, og image

## Deploy

Deployment is automatic via GitHub Actions (`.github/workflows/pages.yml`):

1. Push to `main`. The workflow runs `npm ci && npm run build` and uploads `dist/` as a
   Pages artifact, then deploys it.
2. **One-time setup:** in the repo's **Settings → Pages**, set **Source** to
   **GitHub Actions** (not "Deploy from a branch").
3. The custom domain `freemkv.org` is set via `public/CNAME`, which Astro copies into
   `dist/` at build time. Confirm the domain shows under Settings → Pages after the first
   deploy.

`public/.nojekyll` disables Jekyll processing on Pages so Astro's `_`-prefixed asset
directories are served correctly.
