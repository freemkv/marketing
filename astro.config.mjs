// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

export default defineConfig({
  site: 'https://freemkv.org',
  integrations: [
    starlight({
      title: 'freemkv',
      tagline: 'A composable pipeline for optical-disc video — rip, remux, demux, index. Any source to any sink, decrypted and recovered.',
      favicon: '/favicon.svg',
      logo: { src: './src/assets/freemkv-icon.svg', alt: 'freemkv' },
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://freemkv.org/freemkv-icon.svg' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' } },
        // Site-wide JSON-LD structured data — emitted into every docs page's
        // <head> so search engines and agents get the WebSite + Organization +
        // SoftwareApplication graph on any entry point. The custom landing page
        // (src/pages/index.astro) injects the same graph itself.
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'WebSite',
                '@id': 'https://freemkv.org/#website',
                url: 'https://freemkv.org/',
                name: 'freemkv',
                description:
                  'MIT Rust toolchain that rips and muxes DVD, Blu-ray, and 4K UHD to MKV with AACS/CSS decryption and multi-pass bad-sector recovery.',
                publisher: { '@id': 'https://freemkv.org/#org' },
              },
              {
                '@type': 'Organization',
                '@id': 'https://freemkv.org/#org',
                name: 'freemkv',
                url: 'https://freemkv.org/',
                logo: 'https://freemkv.org/freemkv-icon.svg',
                sameAs: ['https://github.com/freemkv'],
              },
              {
                '@type': 'SoftwareApplication',
                '@id': 'https://freemkv.org/#app',
                name: 'freemkv',
                applicationCategory: 'MultimediaApplication',
                operatingSystem: 'Linux, macOS, Windows',
                url: 'https://freemkv.org/',
                downloadUrl: 'https://freemkv.org/download/',
                license: 'https://opensource.org/licenses/MIT',
                isAccessibleForFree: true,
                author: { '@id': 'https://freemkv.org/#org' },
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
              },
            ],
          }),
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
        SocialIcons: './src/components/SocialIcons.astro',
      },
      // Generates /llms.txt (curated index) and /llms-full.txt (entire docs as one
      // Markdown file) so an agent can ingest the whole site in a single fetch.
      plugins: [
        starlightLlmsTxt({
          projectName: 'freemkv',
          description:
            'MIT Rust toolchain that recovers 100% of readable data from optical discs (DVD / Blu-ray / 4K UHD) and muxes to MKV, automatically, with bad-sector recovery (multi-pass sweep + targeted patch). DVDs (CSS) work out of the box; Blu-ray (AACS 1.0) and 4K UHD (AACS 2.0/2.1) require user-supplied AACS keys.',
        }),
      ],
      // Custom SocialIcons override renders the Discord logo + live star count
      // + a GitHub octocat. The default social icons are disabled so the
      // header isn't doubled up with a redundant far-left GitHub octocat.
      social: [],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', slug: 'overview' },
            { label: 'Install', slug: 'install' },
          ],
        },
        {
          label: 'Platforms',
          items: [
            { label: 'Windows', slug: 'platforms-windows' },
            { label: 'macOS', slug: 'platforms-macos' },
            { label: 'Linux', slug: 'platforms-linux' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'CLI Reference', slug: 'cli' },
            { label: 'autorip Service', slug: 'autorip' },
            { label: 'MKV Output', slug: 'mkv-output' },
            { label: 'Decryption Keys', slug: 'decryption-keys' },
            { label: 'How recovery works', slug: 'how-recovery-works' },
          ],
        },
        {
          label: 'Troubleshooting',
          items: [
            { label: 'Troubleshooting', slug: 'troubleshooting' },
            { label: 'Error Codes', slug: 'error-codes' },
          ],
        },
        {
          label: 'Drive Support',
          items: [
            { label: 'OEM (stock) drives', slug: 'drives-oem' },
            { label: 'Unlocked drives', slug: 'drives-unlocked' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Components', slug: 'components' },
            { label: 'How AACS Works', slug: 'aacs' },
            { label: 'libfreemkv (library)', slug: 'libfreemkv' },
            { label: 'FVI Format', slug: 'fvi-format' },
            { label: 'Changelog', slug: 'changelog' },
            { label: 'License', slug: 'license' },
          ],
        },
      ],
    }),
  ],
});
