// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { graph, websiteNode, orgNode, appNode } from './src/lib/jsonld.mjs';

export default defineConfig({
  site: 'https://freemkv.org',
  // Local dev only: force file-watch polling. In this environment fsevents
  // don't fire for editor writes, so HMR misses changes without polling.
  vite: {
    server: { watch: { usePolling: true, interval: 200 } },
  },
  // The documentation moved from the site root to `/docs/…` (the marketing
  // pages `/` and `/download/` stay at the root). These static redirects keep
  // every previously-published doc URL alive — GitHub Pages has no server-side
  // redirects, so Astro emits a small meta-refresh + canonical stub per entry.
  // They are excluded from the sitemap (see the sitemap `filter` below) so only
  // the canonical `/docs/…` URLs are advertised to crawlers.
  redirects: {
    '/docs': '/docs/overview/',
    '/overview': '/docs/overview/',
    '/install': '/docs/install/',
    '/platforms-windows': '/docs/platforms-windows/',
    '/platforms-macos': '/docs/platforms-macos/',
    '/platforms-linux': '/docs/platforms-linux/',
    '/cli': '/docs/cli/',
    '/autorip': '/docs/autorip/',
    '/mkv-output': '/docs/mkv-output/',
    '/decryption-keys': '/docs/decryption-keys/',
    '/how-recovery-works': '/docs/how-recovery-works/',
    '/troubleshooting': '/docs/troubleshooting/',
    '/error-codes': '/docs/error-codes/',
    '/drives-oem': '/docs/drives-oem/',
    '/drives-unlocked': '/docs/drives-unlocked/',
    '/components': '/docs/components/',
    '/aacs': '/docs/aacs/',
    '/hddvd': '/docs/hddvd/',
    '/libfreemkv': '/docs/libfreemkv/',
    '/fvi-format': '/docs/fvi-format/',
    '/changelog': '/docs/changelog/',
    '/license': '/docs/license/',
    // firmware-commands was merged into firmware-tools (single consolidated
    // firmware reference page) — keep the old URL alive.
    '/docs/firmware-commands': '/docs/firmware-tools/',
  },
  integrations: [
    starlight({
      title: 'freemkv',
      favicon: '/favicon.svg',
      logo: { src: './src/assets/freemkv-icon.svg', alt: 'freemkv' },
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://freemkv.org/freemkv-icon.svg' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' } },
        // Site-wide JSON-LD structured data — emitted into every docs page's
        // <head> so search engines and agents get the WebSite + Organization +
        // SoftwareApplication graph on any entry point. Nodes come from
        // src/lib/jsonld.mjs, shared with the standalone pages under src/pages/.
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: graph(websiteNode(), orgNode(), appNode()),
        },
        // Default to the light theme on first visit (clean, neutral) — the
        // theme toggle still works and persists the user's choice thereafter.
        {
          tag: 'script',
          content:
            "try{if(!localStorage.getItem('starlight-theme'))localStorage.setItem('starlight-theme','light')}catch(e){}",
        },
      ],
      customCss: ['./src/styles/custom.css'],
      // Override the header social icons to add a live GitHub star count
      // (fetched client-side, cached in localStorage) next to the GitHub link.
      components: {
        // Per-page TechArticle JSON-LD (extends the default <head>).
        Head: './src/components/Head.astro',
        SocialIcons: './src/components/SocialIcons.astro',
      },
      // LLM-facing endpoints are plain Astro routes built from the docs
      // collection (no plugin): /llms.txt, /llms-full.txt, /llms-small.txt, and
      // /docs/<slug>.md — see src/pages/llms*.txt.ts and src/pages/[...slug].md.ts.
      // Custom SocialIcons override renders the Discord logo + live star count
      // + a GitHub octocat. The default social icons are disabled so the
      // header isn't doubled up with a redundant far-left GitHub octocat.
      social: [],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', slug: 'docs/overview' },
            { label: 'Install', slug: 'docs/install' },
          ],
        },
        {
          label: 'Platforms',
          items: [
            { label: 'Windows', slug: 'docs/platforms-windows' },
            { label: 'macOS', slug: 'docs/platforms-macos' },
            { label: 'Linux', slug: 'docs/platforms-linux' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'CLI Reference', slug: 'docs/cli' },
            { label: 'autorip Service', slug: 'docs/autorip' },
            { label: 'MKV Output', slug: 'docs/mkv-output' },
            { label: 'Decryption Keys', slug: 'docs/decryption-keys' },
            { label: 'How recovery works', slug: 'docs/how-recovery-works' },
          ],
        },
        {
          label: 'Troubleshooting',
          items: [
            { label: 'Troubleshooting', slug: 'docs/troubleshooting' },
            { label: 'Error Codes', slug: 'docs/error-codes' },
          ],
        },
        {
          label: 'Drive Support',
          items: [
            { label: 'OEM (stock) drives', slug: 'docs/drives-oem' },
            { label: 'Unlocked drives', slug: 'docs/drives-unlocked' },
            { label: 'Firmware', slug: 'docs/firmware-tools' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Components', slug: 'docs/components' },
            { label: 'How AACS Works', slug: 'docs/aacs' },
            { label: 'Pioneer firmware', slug: 'docs/pioneer-firmware' },
            { label: 'HD DVD Format', slug: 'docs/hddvd' },
            { label: 'libfreemkv (library)', slug: 'docs/libfreemkv' },
            { label: 'FVI Format', slug: 'docs/fvi-format' },
            { label: 'Changelog', slug: 'docs/changelog' },
            { label: 'License', slug: 'docs/license' },
          ],
        },
      ],
    }),
  ],
});
