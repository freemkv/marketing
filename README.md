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
`scripts/firmware-features.mjs` (see [firmware-release.md](scripts/firmware-release.md)). The page also reads `src/data/pioneer-firmware-index.json`.
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

1. Push to `main`. The workflow runs `npm ci` and `npm run build`, then uploads
   `dist/` to the Cloudflare Pages project `freemkv` with Wrangler.
2. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository
   secrets. The custom domain `freemkv.org` is managed in Cloudflare Pages.
3. Release badges resolve published GitHub releases during the build. Deploy
   documentation for a new tool release after that release is published.

### Release badges and announcements

Builds resolve the app and firmware tools from each repository’s GitHub latest
stable release, including the publication date. GitHub API failures stop the
build rather than publishing stale defaults. CI supplies `GH_TOKEN`; local
builds can also use it to avoid unauthenticated rate limits. Browser refreshes
remain enabled, but older cached versions cannot replace the built badge.

Discord announcements are serialized and claimed once per app version using
`refs/tags/discord-announced/vX.Y.Z`. Existing releases in
`.github/announced-versions.txt` are excluded during migration. Manual dispatch
uses the same protection. Claims are written before sending to avoid duplicate
pings if Discord accepts a request but its response is lost. If a send fails,
inspect Discord and the workflow log; only after confirming no message was
posted should an operator delete that version’s claim tag and dispatch again.
Do not remove a claim merely because a workflow is being retried.
