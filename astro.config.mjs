// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

export default defineConfig({
  site: 'https://freemkv.org',
  integrations: [
    starlight({
      title: 'freemkv',
      tagline: 'Recover 100% of readable data from any optical disc — to MKV, automatically',
      favicon: '/favicon.svg',
      logo: { src: './src/assets/freemkv-icon.svg', alt: 'freemkv' },
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://freemkv.org/freemkv-icon.svg' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary' } },
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
            'AGPL-3.0 Rust toolchain that recovers 100% of readable data from optical discs (DVD / Blu-ray / 4K UHD) and muxes to MKV, automatically, with bad-sector recovery (multi-pass sweep + targeted patch). DVDs (CSS) work out of the box; Blu-ray (AACS 1.0) and 4K UHD (AACS 2.0/2.1) require user-supplied AACS keys.',
        }),
      ],
      social: [
        { icon: 'discord', label: 'Discord', href: 'https://discord.com/channels/1519566883282489545/' },
        { icon: 'github', label: 'GitHub', href: 'https://github.com/freemkv' },
      ],
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
            { label: 'Troubleshooting', slug: 'troubleshooting' },
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
            { label: 'libfreemkv (library)', slug: 'libfreemkv' },
            { label: 'Changelog', slug: 'changelog' },
            { label: 'License', slug: 'license' },
          ],
        },
      ],
    }),
  ],
});
