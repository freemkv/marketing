// A browser challenge authorizes one download; Origin alone is not authorization.
// Keep this handler separate from the Pages adapter so rejection paths are tested.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const DOWNLOAD_ACTION = 'firmware-download';

export function catalogueKeys(...catalogues) {
  return new Set(catalogues.flatMap(rows => rows.flatMap(row =>
    (row.versions ?? []).map(version => version.file).filter(Boolean))));
}

function reply(message, status, extra = {}) {
  return new Response(message, {status, headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  }});
}

export async function firmwareDownload(request, env, allowedKeys, fetcher = fetch) {
  if (request.method !== 'POST') return reply('Use Download on the firmware finder.', 405, {Allow: 'POST'});
  if (!env.FIRMWARE_BUCKET || !env.FIRMWARE_TURNSTILE_SECRET) return reply('Downloads are temporarily unavailable.', 503);
  const url = new URL(request.url);
  // Defense in depth only: curl can forge Origin. Siteverify remains mandatory.
  if (request.headers.get('Origin') !== url.origin) return reply('Open the firmware finder to download.', 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply('Expected JSON.', 415);
  // Read bounded input even when Content-Length is missing or dishonest.
  const reader = request.body?.getReader();
  if (!reader) return reply('Missing download request.', 400);
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) { await reader.cancel(); return reply('Request too large.', 413); }
      chunks.push(value);
    }
  } catch { return reply('Invalid download request.', 400); }
  const data = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(data)); } catch { return reply('Invalid download request.', 400); }
  if (!payload || typeof payload !== 'object' || !allowedKeys.has(payload.file)) return reply('Firmware not found.', 404);
  if (typeof payload.token !== 'string' || !payload.token || payload.token.length > 2048) return reply('Please complete the download verification.', 403);
  let validation;
  try {
    const response = await fetcher(VERIFY_URL, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({secret: env.FIRMWARE_TURNSTILE_SECRET, response: payload.token,
        remoteip: request.headers.get('CF-Connecting-IP') || undefined}),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return reply('Verification is temporarily unavailable. Try again.', 503);
    validation = await response.json();
  } catch { return reply('Verification is temporarily unavailable. Try again.', 503); }
  if (!validation || validation.success !== true || validation.hostname !== url.hostname || validation.action !== DOWNLOAD_ACTION)
    return reply('Verification expired or failed. Click Download to try again.', 403);
  // Catalogues contain URL-escaped paths; Wrangler PUT decodes those once.
  let key;
  try { key = decodeURIComponent(payload.file); } catch { return reply('Firmware not found.', 404); }
  let object;
  try { object = await env.FIRMWARE_BUCKET.get(key); } catch { return reply('Download is temporarily unavailable. Try again.', 503); }
  if (!object) return reply('Firmware not found.', 404);
  const filename = key.split('/').pop();
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return new Response(object.body, {headers: {
    'Content-Type': key.endsWith('.tar') ? 'application/x-tar' : 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
    'Content-Length': String(object.size),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }});
}
