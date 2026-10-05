// Shared helpers that turn a docs collection entry into clean, self-contained
// Markdown for machine readers (/docs/<slug>.md and /llms.txt). Build-time only.
import { latestRelease } from './releases.mjs';
import { shotsFor } from '../data/app-screenshots';

export const SITE = 'https://freemkv.org';

type DocEntry = {
  id: string;
  body?: string;
  filePath?: string;
  data: { title?: string; description?: string };
};

/** Canonical HTML URL of a docs entry (`docs/cli` -> https://freemkv.org/docs/cli/). */
export const htmlUrl = (id: string) => `${SITE}/${id}/`;
/** URL of the Markdown rendition of a docs entry. */
export const markdownUrl = (id: string) => `${SITE}/${id}.md`;

// Match the release version rendered in the docs HTML.
const { version: firmwareFallback } = await latestRelease('freemkv-firmware');

/**
 * MDX bodies contain `import` lines and Astro/Starlight components that mean
 * nothing outside the site. Flatten the ones the docs use into plain Markdown:
 *   <Aside type="x" title="T">…</Aside>  ->  "> **X: T**" blockquote
 *   <FirmwareVersion />                  ->  the version the static page shows
 *   <AppShowcase os="x" />               ->  Markdown images of that OS's screenshots
 * (Asides are dropped entirely in the abridged corpus.)
 */
function mdxToMarkdown(body: string, drop = false): string {
  let out = body.replace(/^(import|export)\s[^\n]*\n/gm, '');
  out = out.replace(/<FirmwareVersion\s*\/>/g, firmwareFallback);
  out = out.replace(/<AppShowcase\s+os=["']([^"']+)["']\s*\/>/g, (_m, os: string) => {
    return shotsFor(os).map((s) => `![${s.alt} (${s.label})](${s.src})`).join('\n\n');
  });
  out = out.replace(
    /<Aside([^>]*)>([\s\S]*?)<\/Aside>/g,
    (_m, attrs: string, inner: string) => {
      if (drop) return '';
      const type = /type=["']([^"']+)["']/.exec(attrs)?.[1] ?? 'note';
      const title = /title=["']([^"']+)["']/.exec(attrs)?.[1];
      const label = type.charAt(0).toUpperCase() + type.slice(1);
      const head = `> **${title ? `${label}: ${title}` : label}**`;
      const lines = inner.trim().split('\n').map((l) => (l ? `> ${l}` : '>'));
      return [head, '>', ...lines].join('\n');
    }
  );
  return out;
}

/** Root-relative Markdown links (`](/foo/)`) -> absolute, so they work out of context. */
const absolutiseLinks = (md: string) => md.replace(/\]\(\//g, `](${SITE}/`);

/**
 * Starlight `:::type[Title]` … `:::` asides (in .md pages) -> blockquotes, or
 * dropped entirely when `drop` is set (the abridged corpus). Fenced code
 * blocks are left untouched.
 */
function asides(md: string, drop: boolean): string {
  const out: string[] = [];
  let fence: string | null = null;
  let inAside = false;
  for (const line of md.split('\n')) {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f && !inAside) {
      if (!fence) fence = f[1];
      else if (line.trim().startsWith(fence)) fence = null;
      out.push(line);
      continue;
    }
    if (fence) {
      out.push(line);
      continue;
    }
    const open = /^\s*:::(\w+)(?:\[(.*)\])?\s*$/.exec(line);
    if (!inAside && open) {
      inAside = true;
      if (!drop) {
        const label = open[1].charAt(0).toUpperCase() + open[1].slice(1);
        out.push(`> **${open[2] ? `${label}: ${open[2]}` : label}**`, '>');
      }
      continue;
    }
    if (inAside && /^\s*:::\s*$/.test(line)) {
      inAside = false;
      continue;
    }
    if (inAside) {
      if (!drop) out.push(line ? `> ${line}` : '>');
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Clean Markdown body of a docs entry (no title/summary header). */
export function docsBody(entry: DocEntry, { abridged = false } = {}): string {
  const isMdx = entry.filePath?.endsWith('.mdx') ?? false;
  let body = entry.body ?? '';
  if (isMdx) body = mdxToMarkdown(body, abridged);
  body = asides(body, abridged);
  body = absolutiseLinks(body);
  if (abridged) body = body.replace(/\n{3,}/g, '\n\n');
  return body.trim();
}

/** Full Markdown document for one docs entry: title, summary, source URL, body. */
export function docsMarkdown(entry: DocEntry, opts: { abridged?: boolean; level?: number } = {}): string {
  const { title, description } = entry.data;
  const h = '#'.repeat(opts.level ?? 1);
  const header: string[] = [];
  if (title) header.push(`${h} ${title}`);
  if (description) header.push(`> ${description}`);
  header.push(`Source: ${htmlUrl(entry.id)}`);
  return `${header.join('\n\n')}\n\n${docsBody(entry, opts)}\n`;
}

/**
 * Docs entries in reading order: the sidebar order Starlight renders, then any
 * page not in the sidebar (alphabetically). Returns [groupLabel, entries][].
 */
export function inSidebarOrder<T extends { id: string }>(
  docs: T[],
  sidebar: Array<{ label?: string; slug?: string; items?: Array<{ slug?: string }> }>
): Array<[string, T[]]> {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const groups: Array<[string, T[]]> = [];
  for (const g of sidebar ?? []) {
    const items = (g.items ?? [])
      .map((i) => (i.slug ? byId.get(i.slug.replace(/^\/|\/$/g, '')) : undefined))
      .filter((d): d is T => !!d && !seen.has(d.id));
    items.forEach((d) => seen.add(d.id));
    if (items.length) groups.push([g.label ?? 'Docs', items]);
  }
  const rest = docs.filter((d) => !seen.has(d.id)).sort((a, b) => a.id.localeCompare(b.id));
  if (rest.length) groups.push(['More docs', rest]);
  return groups;
}
