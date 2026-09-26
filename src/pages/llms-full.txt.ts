import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
// @ts-expect-error virtual module provided by Starlight
import starlightConfig from 'virtual:starlight/user-config';
import { corpus } from '../lib/llms-corpus';

// /llms-full.txt — every docs page as clean Markdown in one file, in sidebar
// order, each headed by its title, summary, and canonical URL. Built from the
// docs collection at build time. See also /llms.txt and /llms-small.txt.
export const prerender = true;

export const GET: APIRoute = async () =>
  new Response(corpus(await getCollection('docs'), starlightConfig.sidebar, { abridged: false }), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
