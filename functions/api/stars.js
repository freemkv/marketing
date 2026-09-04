// Edge-cached GitHub star count, served at /api/stars.
//
// The site header shows a live star count for github.com/freemkv/freemkv.
// Fetching api.github.com directly from every visitor's browser burns the
// unauthenticated rate limit (~60 req/hr per IP — brutal behind shared/NAT
// IPs). This Pages Function fetches it server-side ONCE per hour and caches the
// result at Cloudflare's edge, so all visitors share one cached value and the
// browser only ever talks to our own origin.
//
// Always returns 200 with `{ "stars": <number|null> }`; on any upstream failure
// `stars` is null and the client simply renders the star icon with no number.
export async function onRequest(context) {
  const cache = caches.default;
  // Cache key is our own canonical URL (independent of the incoming request's
  // query/headers) so every visitor shares the one cached entry.
  const cacheKey = new Request('https://freemkv.org/api/stars');

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let stars = null;
  try {
    const gh = await fetch('https://api.github.com/repos/freemkv/freemkv', {
      headers: {
        Accept: 'application/vnd.github+json',
        // GitHub requires a User-Agent or it rejects the request.
        'User-Agent': 'freemkv.org star-counter',
      },
    });
    if (gh.ok) {
      const data = await gh.json();
      if (typeof data.stargazers_count === 'number') stars = data.stargazers_count;
    }
  } catch (_) {
    /* leave stars null */
  }

  const resp = new Response(JSON.stringify({ stars }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      // One hour at the edge; matches the client-side localStorage TTL.
      'Cache-Control': 'public, max-age=3600',
    },
  });
  // Only cache a real value — never pin a null (a transient GitHub hiccup)
  // for an hour.
  if (stars !== null) context.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}
