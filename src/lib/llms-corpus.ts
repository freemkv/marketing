// Builds the single-file docs corpora served at /llms-full.txt and
// /llms-small.txt from the docs collection. Build-time only.
import { SITE, docsMarkdown, inSidebarOrder } from './docs-markdown';

type Entry = Parameters<typeof docsMarkdown>[0];

/** Pages left out of the abridged corpus (long and historical, not how-to). */
const ABRIDGED_EXCLUDE = new Set(['docs/changelog']);

export function corpus(
  docs: Entry[],
  sidebar: Parameters<typeof inSidebarOrder>[1],
  { abridged }: { abridged: boolean }
): string {
  const entries = inSidebarOrder(docs, sidebar)
    .flatMap(([, e]) => e)
    .filter((e) => !(abridged && ABRIDGED_EXCLUDE.has(e.id)));
  const intro = [
    `<SYSTEM>This is the ${abridged ? 'abridged' : 'full'} documentation for freemkv (${SITE}/). Index: ${SITE}/llms.txt</SYSTEM>`,
  ];
  return [...intro, ...entries.map((e) => docsMarkdown(e, { abridged }).trimEnd())].join('\n\n') + '\n';
}
