import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import GithubSlugger from 'github-slugger';

const SITE = 'https://freemkv.org';

// Minimal, safe Markdown → HTML for a changelog section body. The changelog
// uses only: `### subheadings`, `- bullets`, `**bold**`, `` `code` ``,
// `[text](url)` links, and blank-line-separated paragraphs. We escape first,
// then re-introduce a known-good subset, so nothing in the source can inject
// raw markup into the feed.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInline(text: string): string {
  let t = escapeHtml(text);
  // `code`
  t = t.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  // [label](url)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const safeUrl = url.replace(/"/g, '%22');
    return `<a href="${safeUrl}">${label}</a>`;
  });
  // **bold**
  t = t.replace(/\*\*([^*]+)\*\*/g, (_m, b) => `<strong>${b}</strong>`);
  return t;
}

function markdownSectionToHtml(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  let inList = false;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${renderInline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line)) {
      flushPara();
      closeList();
      out.push(`<h3>${renderInline(line.replace(/^###\s+/, ''))}</h3>`);
    } else if (/^[-*]\s+/.test(line)) {
      flushPara();
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${renderInline(line.replace(/^[-*]\s+/, ''))}</li>`);
    } else if (line.trim() === '') {
      flushPara();
      closeList();
    } else {
      // continuation of a paragraph or a wrapped list item
      closeList();
      para.push(line.trim());
    }
  }
  flushPara();
  closeList();
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
    const anchor = slugger.slug(heading);
    // Body text below the heading line.
    const headingLine = m[0];
    const idx = section.indexOf(headingLine);
    const sectionBody = section.slice(idx + headingLine.length).trim();
    const descriptionHtml = markdownSectionToHtml(sectionBody);

    items.push({
      title: heading,
      link: `${SITE}/changelog/#${anchor}`,
      description: descriptionHtml || heading,
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
