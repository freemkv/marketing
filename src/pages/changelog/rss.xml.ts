import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import GithubSlugger from 'github-slugger';

const SITE = 'https://freemkv.org';

// Minimal, safe Markdown → HTML for a changelog section body. The changelog
// uses only: `### subheadings`, `- bullets` (nested, possibly line-wrapped),
// `**bold**`, `*italic*`, `` `code` ``, `[text](url)` links, and
// blank-line-separated paragraphs. We escape first, then re-introduce a
// known-good subset, so nothing in the source can inject raw markup into
// the feed.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInline(text: string): string {
  let t = escapeHtml(text);
  // `code` — swapped out for placeholders so literal * or [ inside a code
  // span can't be mistaken for emphasis or link syntax below.
  const codes: string[] = [];
  t = t.replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  // [label](url)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const safeUrl = url.replace(/"/g, '%22');
    return `<a href="${safeUrl}">${label}</a>`;
  });
  // **bold**, then *italic* on whatever asterisks remain
  t = t.replace(/\*\*([^*]+)\*\*/g, (_m, b) => `<strong>${b}</strong>`);
  t = t.replace(/\*([^*\s][^*]*)\*/g, (_m, i) => `<em>${i}</em>`);
  return t.replace(/\u0000(\d+)\u0000/g, (_m, i) => codes[Number(i)]);
}

interface ListItem {
  text: string;
  children: ListItem[];
  // Text that appeared after the nested list (an indented follow-up
  // paragraph closing out the bullet) — rendered after the children so
  // the feed keeps the source's order.
  after: string;
}

function renderList(items: ListItem[]): string {
  const lis = items.map((i) => {
    const kids = i.children.length ? renderList(i.children) : '';
    const tail = i.after ? `<p>${renderInline(i.after)}</p>` : '';
    return `<li>${renderInline(i.text)}${kids}${tail}</li>`;
  });
  return `<ul>\n${lis.join('\n')}\n</ul>`;
}

function markdownSectionToHtml(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let roots: ListItem[] = [];
  // Open items, outermost first; the last entry is where continuation
  // text and deeper bullets attach.
  let stack: ListItem[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${renderInline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (roots.length) {
      out.push(renderList(roots));
      roots = [];
      stack = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (/^###\s+/.test(line)) {
      flushPara();
      flushList();
      out.push(`<h3>${renderInline(line.replace(/^###\s+/, ''))}</h3>`);
    } else if (bullet) {
      flushPara();
      // Bullets nest by 2-space indent: depth 0 at column 0, depth 1 at 2, …
      const depth = Math.min(Math.floor(bullet[1].length / 2), stack.length);
      stack.length = depth;
      const item: ListItem = { text: bullet[2].trim(), children: [], after: '' };
      (depth === 0 ? roots : stack[depth - 1].children).push(item);
      stack.push(item);
    } else if (line.trim() === '') {
      // A blank line ends a paragraph but not necessarily the list —
      // an indented follow-up paragraph still belongs to its bullet.
      flushPara();
    } else if (stack.length && /^\s/.test(raw)) {
      // Continuation of a wrapped bullet (or an indented paragraph inside
      // one). Its indent says which open bullet it belongs to: content of
      // a bullet at depth d is indented to column 2·(d+1).
      const owner = Math.min(
        Math.max(Math.floor((raw.match(/^\s*/)![0].length - 2) / 2), 0),
        stack.length - 1,
      );
      stack.length = owner + 1;
      const item = stack[owner];
      if (item.children.length) {
        item.after += (item.after ? ' ' : '') + line.trim();
      } else {
        item.text += ' ' + line.trim();
      }
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return out.join('\n');
}

export async function GET(context: { site?: URL | string }) {
  const docs = await getCollection('docs');
  const changelog = docs.find((d) => d.id === 'changelog' || d.slug === 'changelog');
  if (!changelog) {
    return new Response('changelog not found', { status: 404 });
  }

  // Split the raw markdown body on top-level `## ` headings, one item per
  // version. Anything before the first `## ` (the intro paragraphs) is dropped.
  const body = changelog.body ?? '';
  const slugger = new GithubSlugger();
  const sections = body.split(/\n(?=## )/);
  const items = [];

  for (const section of sections) {
    const m = section.match(/^##\s+(.+?)\s*$/m);
    if (!m) continue; // intro text before the first heading
    const heading = m[1].trim();
    // The page anchor is slugged from the full heading text as written.
    const anchor = slugger.slug(heading);
    // Body text below the heading line.
    const headingLine = m[0];
    const idx = section.indexOf(headingLine);
    let sectionBody = section.slice(idx + headingLine.length).trim();

    // Release date: a leading `<small>YYYY-MM-DD</small>` line under the
    // heading (the normal form), or a `— YYYY-MM-DD` suffix on the heading
    // itself (legacy form). Either way it becomes the item's pubDate
    // instead of feed text.
    let date: string | undefined;
    const small = sectionBody.match(/^<small>(\d{4}-\d{2}-\d{2})<\/small>\s*/);
    if (small) {
      date = small[1];
      sectionBody = sectionBody.slice(small[0].length);
    }
    let title = heading;
    const inline = heading.match(/^(.*?)\s+—\s+(\d{4}-\d{2}-\d{2})$/);
    if (inline) {
      title = inline[1];
      date ??= inline[2];
    }

    const descriptionHtml = markdownSectionToHtml(sectionBody);

    items.push({
      title,
      link: `${SITE}/changelog/#${anchor}`,
      description: descriptionHtml || title,
      ...(date ? { pubDate: new Date(`${date}T00:00:00Z`) } : {}),
    });
  }

  return rss({
    title: 'freemkv Changelog',
    description:
      'Notable changes across the freemkv toolchain (CLI, library, and autorip service), newest first.',
    site: context.site ?? SITE,
    items,
  });
}
