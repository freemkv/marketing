# freemkv.org

Source for the [freemkv.org](https://freemkv.org) website — an Astro + Starlight site
(landing splash + docs), deployed to GitHub Pages.

## Local development

```bash
npm install
npm run dev       # local dev server
npm run build     # production build -> dist/
npm run preview   # preview the built site
```

## Structure

- `src/pages/index.astro` — landing splash (hero + Download CTA + feature cards);
  a standalone page outside the Starlight docs collection
- `src/content/docs/docs/*.md` — documentation pages (Overview, Install, Components,
  autorip, AACS, Decryption Keys, License, and more)
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
