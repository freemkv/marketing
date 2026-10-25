// A browser challenge authorizes one download; Origin alone is not authorization.
// Keep this handler separate from the Pages adapter so rejection paths are tested.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const DOWNLOAD_ACTION = 'firmware-download';

const SHA256 = /^[a-f0-9]{64}$/;
/** Downloads are identified only by a package hash in the authoritative catalog. */
export function downloadAllowlist({ catalog = null } = {}) {
  const bySha = new Map();
  for (const identity of catalog?.identities ?? []) for (const revision of identity.revisions ?? []) for (const p of revision.packages ?? []) {
    if (SHA256.test(p.sha256) && p.key && !bySha.has(p.sha256)) bySha.set(p.sha256, {key:p.key,filename:p.filename});
  }
  return { bySha };
}

export function resolveDownload(allowlist, payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.package !== 'string' || !SHA256.test(payload.package)) return null;
  return allowlist.bySha.get(payload.package) ?? null;
}

function contentDisposition(filename) {
  const clean = String(filename).replace(/[\x00-\x1f\x7f"\\/]/g, '_') || 'firmware.bin';
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(clean).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function reply(message, status, extra = {}) {
  return new Response(message, {status, headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  }});
}

export async function firmwareDownload(request, env, allowlist, fetcher = fetch) {
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
  const entry = resolveDownload(allowlist, payload);
  if (!entry) return reply('Firmware not found.', 404);
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
  let object;
  try { object = await env.FIRMWARE_BUCKET.get(entry.key); } catch { return reply('Download is temporarily unavailable. Try again.', 503); }
  if (!object) return reply('Firmware not found.', 404);
  return new Response(object.body, {headers: {
    'Content-Type': entry.key.endsWith('.tar') ? 'application/x-tar' : 'application/octet-stream',
    'Content-Disposition': contentDisposition(entry.filename),
    'Content-Length': String(object.size),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }});
}
