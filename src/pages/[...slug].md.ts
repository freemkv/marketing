import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { docsMarkdown } from '../lib/docs-markdown';

// Per-docs-page raw Markdown. Every docs page `/docs/foo/` also serves its
// source at `/docs/foo.md`, so an agent (or a human) can fetch the clean
// Markdown for any single page — complementing the site-wide `/llms.txt`
// (index) and `/llms-full.txt` (whole corpus). One static file per doc entry;
// each docs page links to it via <link rel="alternate" type="text/markdown">
// (src/components/Head.astro).
export const getStaticPaths: GetStaticPaths = async () => {
  const docs = await getCollection('docs');
  return docs.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
};

export const GET: APIRoute = ({ props }) => {
  const { entry } = props as {
    entry: { id: string; body?: string; filePath?: string; data: { title?: string; description?: string } };
  };
  return new Response(docsMarkdown(entry), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
