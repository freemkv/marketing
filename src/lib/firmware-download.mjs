// A browser challenge authorizes one download; Origin alone is not authorization.
// Keep this handler separate from the Pages adapter so rejection paths are tested.
import { buildFinderData } from './finder.mjs';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const DOWNLOAD_ACTION = 'firmware-download';

const SHA256 = /^[a-f0-9]{64}$/;
export const DAILY_LIMIT = 10;
const DAY_MS = 86400000;
let warnedNoLimiter = false;

/**
 * Per-IP daily quota in KV (`FIRMWARE_RATELIMIT`): key dl:<ip>:<UTC date>.
 * Called only after Turnstile and the allowlist pass, so failed or invalid
 * requests never consume quota. Missing binding or KV outage fails open on the
 * limit only; Turnstile and the allowlist are still enforced.
 */
export async function checkDailyLimit(env, ip, now) {
  const kv = env.FIRMWARE_RATELIMIT;
  if (!kv) {
    if (!warnedNoLimiter) { warnedNoLimiter = true; console.warn('FIRMWARE_RATELIMIT binding missing: download rate limit disabled'); }
    return { allowed: true, commit: async () => {} };
  }
  const key = `dl:${ip}:${new Date(now).toISOString().slice(0, 10)}`;
  let count = 0;
  try { count = Number.parseInt(await kv.get(key), 10) || 0; } catch { return { allowed: true, commit: async () => {} }; }
  if (count >= DAILY_LIMIT) return { allowed: false, retryAfter: Math.max(1, Math.ceil((Math.floor(now / DAY_MS + 1) * DAY_MS - now) / 1000)) };
  return { allowed: true, commit: async () => { try { await kv.put(key, String(count + 1), { expirationTtl: 90000 }); } catch {} } };
}

/**
 * Exact download allowlist from the published catalogues:
 *  bySha:  package sha256 -> {key (R2 object key, decoded), filename}
 *  byFile: legacy catalogue `file` paths (v1 site keys, legacy-keys.json) -> sha256
 * Built with the same normalisation the finder uses, so every Download button
 * the page renders resolves here and nothing else does.
 */
export function downloadAllowlist({ catalog = null, mediatek = [], pioneer = [], legacyKeys = null } = {}) {
  const data = buildFinderData({ catalog, mediatek, pioneer });
  const bySha = new Map();
  for (const identity of data.identities) for (const revision of identity.revisions) for (const p of revision.packages)
    if (SHA256.test(p.sha256) && p.key && !bySha.has(p.sha256)) bySha.set(p.sha256, { key: p.key, filename: p.filename });
  const byFile = new Map();
  for (const row of [...mediatek, ...pioneer]) for (const v of row.versions ?? [])
    if (v.file && bySha.has(v.sha256)) byFile.set(v.file, v.sha256);
  for (const row of legacyKeys?.keys ?? []) {
    const entry = bySha.get(row.sha256);
    // A legacy key only resolves to the bytes it was published with.
    if (entry && typeof row.key === 'string' && (!row.new_key || row.new_key === entry.key || !entry.key.startsWith('fw/'))) byFile.set(row.key, row.sha256);
  }
  return { bySha, byFile };
}

export function resolveDownload(allowlist, payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.package === 'string') return SHA256.test(payload.package) ? allowlist.bySha.get(payload.package) ?? null : null;
  if (typeof payload.file === 'string') {
    const sha = allowlist.byFile.get(payload.file);
    return sha ? allowlist.bySha.get(sha) ?? null : null;
  }
  return null;
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

export async function firmwareDownload(request, env, allowlist, fetcher = fetch, now = Date.now) {
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
  const limit = await checkDailyLimit(env, request.headers.get('CF-Connecting-IP') || 'unknown', now());
  if (!limit.allowed) return reply('Download limit reached.', 429, {'Retry-After': String(limit.retryAfter)});
  let object;
  try { object = await env.FIRMWARE_BUCKET.get(entry.key); } catch { return reply('Download is temporarily unavailable. Try again.', 503); }
  if (!object) return reply('Firmware not found.', 404);
  await limit.commit();
  return new Response(object.body, {headers: {
    'Content-Type': entry.key.endsWith('.tar') ? 'application/x-tar' : 'application/octet-stream',
    'Content-Disposition': contentDisposition(entry.filename),
    'Content-Length': String(object.size),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }});
}
