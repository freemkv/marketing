import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
// @ts-expect-error virtual module provided by Starlight
import starlightConfig from 'virtual:starlight/user-config';
import { corpus } from '../lib/llms-corpus';

// /llms-small.txt — the abridged corpus: same as /llms-full.txt minus asides
// (notes/tips/cautions) and the changelog, for smaller context windows.
export const prerender = true;

export const GET: APIRoute = async () =>
  new Response(corpus(await getCollection('docs'), starlightConfig.sidebar, { abridged: true }), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
