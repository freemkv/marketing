import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
// Starlight's resolved user config — the same sidebar the docs render with, so
// the index below is grouped and ordered exactly like the site navigation.
// @ts-expect-error virtual module provided by Starlight
import starlightConfig from 'virtual:starlight/user-config';
import { SITE, inSidebarOrder, markdownUrl } from '../lib/docs-markdown';

// /llms.txt (https://llmstxt.org): H1, blockquote summary, short context, then
// one section per docs sidebar group linking every docs page (Markdown
// rendition + one-line description from frontmatter), then the non-docs pages.
// Generated from the docs collection at build time so it never drifts.
//
// Companion endpoints: /llms-full.txt, /llms-small.txt, and /docs/<slug>.md.
export const prerender = true;

const SUMMARY =
  'MIT Rust toolchain that recovers 100% of readable data from optical discs (DVD / Blu-ray / 4K UHD) and muxes to MKV, automatically, with bad-sector recovery (multi-pass sweep + targeted patch). DVDs (CSS) work out of the box; Blu-ray (AACS 1.0) and 4K UHD (AACS 2.0/2.1) require user-supplied AACS keys.';

const CONTEXT = [
  'freemkv is free and open source (MIT). It ships as a desktop app (`freemkv`), a command-line build (`freemkv-cli`), and a headless ripping service (`autorip`), for Windows, macOS, and Linux. The core is the `libfreemkv` Rust library.',
  'Every docs page is available as clean Markdown by appending `.md` to its path (for example https://freemkv.org/docs/cli.md); the links below point at those Markdown renditions. The HTML page is the same path with a trailing slash.',
].join('\n\n');

export const GET: APIRoute = async () => {
  const docs = await getCollection('docs');
  const sections = inSidebarOrder(docs, starlightConfig.sidebar).map(
    ([label, entries]) =>
      `## ${label}\n\n` +
      entries
        .map((d) => {
          const desc = d.data.description ? `: ${d.data.description}` : '';
          return `- [${d.data.title}](${markdownUrl(d.id)})${desc}`;
        })
        .join('\n')
  );

  sections.push(
    `## Website\n\n` +
      [
        `- [freemkv home](${SITE}/): what freemkv is and the composable \`freemkv <source> <dest>\` pipeline`,
        `- [Download](${SITE}/download/): the freemkv app, the freemkv CLI, and autorip for Windows, macOS, and Linux (Intel & ARM)`,
        `- [Firmware](${SITE}/firmware/): find, modify, and flash optical-drive firmware for freemkv`,
        `- [Find your drive firmware](${SITE}/firmware/find/): search a drive model to find its OEM firmware base image`,
        `- [freemkv-fw (modify)](${SITE}/firmware/modify/): turn a MediaTek drive firmware image into freemkv firmware and verify it`,
        `- [freemkv-flash (flash)](${SITE}/firmware/flash/): generic optical-drive flasher and dumper that backs up before writing and verifies after`,
      ].join('\n')
  );

  sections.push(
    `## Optional\n\n` +
      [
        `- [Complete documentation](${SITE}/llms-full.txt): every docs page concatenated into one Markdown file`,
        `- [Abridged documentation](${SITE}/llms-small.txt): the docs without asides and the changelog, for smaller context windows`,
        `- [Changelog RSS](${SITE}/docs/changelog/rss.xml): release notes feed`,
        `- [Source code](https://github.com/freemkv): all freemkv repositories on GitHub`,
      ].join('\n')
  );

  const out = [`# freemkv`, `> ${SUMMARY}`, CONTEXT, ...sections].join('\n\n') + '\n';
  return new Response(out, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
