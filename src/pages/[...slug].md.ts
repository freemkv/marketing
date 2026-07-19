import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

// Per-docs-page raw Markdown. Every docs page `/foo/` also serves its source at
// `/foo.md`, so an agent (or a human) can fetch the clean Markdown for any single
// page — complementing the site-wide `/llms.txt` (index) and `/llms-full.txt`
// (whole corpus). One static file per doc entry.
export const getStaticPaths: GetStaticPaths = async () => {
  const docs = await getCollection('docs');
  return docs.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
};

export const GET: APIRoute = ({ props }) => {
  const { entry } = props as { entry: { body?: string; data: { title?: string } } };
  const title = entry.data?.title ? `# ${entry.data.title}\n\n` : '';
  const body = entry.body ?? '';
  return new Response(title + body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
