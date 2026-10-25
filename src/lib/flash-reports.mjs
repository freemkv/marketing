// Private diagnostic report intake for the desktop flash app. The browser
// authorizes scope; the app uploads the resulting ZIP with a one-use token.
const MAX_ZIP = 50 * 1024 * 1024;
const REQUEST_TTL = 15 * 60 * 1000;
const UPLOAD_TTL = 60 * 60 * 1000;
const RETAIN = 90 * 24 * 60 * 60 * 1000;
const hex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value)));
const reply = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'}});
const refuse = (message, status = 400) => reply({error: message}, status);
const bearer = request => request.headers.get('Authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];
const validId = id => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);
const configured = env => env.FIRMWARE_VERIFICATIONS && env.FLASH_REPORTS_BUCKET && env.FIRMWARE_EMAIL_SERVICE
  && typeof env.FLASH_REPORT_SECRET === 'string' && env.FLASH_REPORT_SECRET.length >= 32;
const db = env => env.FIRMWARE_VERIFICATIONS;
async function boundedBytes(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = []; let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function keyed(env, purpose, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.FLASH_REPORT_SECRET),
    {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${purpose}\0${value}`))));
}
const clean = async (env, now) => {
  await db(env).prepare('DELETE FROM flash_report_requests WHERE created_at < ?').bind(now - RETAIN - 24 * 60 * 60 * 1000).run();
};
async function row(env, id) {
  if (!validId(id)) return null;
  return db(env).prepare('SELECT * FROM flash_report_requests WHERE id = ?').bind(id).first();
}
async function authorized(request, env, id, field) {
  const value = bearer(request), record = await row(env, id);
  if (!value || !record || !record[field] || await digest(value) !== record[field]) return null;
  return record;
}

export async function createRequest({request, env}, now = Date.now()) {
  if (request.method !== 'POST') return refuse('Use POST.', 405);
  if (!configured(env)) return refuse('Report submission is unavailable.', 503);
  if (request.headers.get('Content-Length') && Number(request.headers.get('Content-Length')) > 4096) return refuse('Request too large.', 413);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return refuse('Invalid origin.', 403);
  const id = crypto.randomUUID(), poll = token(), approval = token();
  await clean(env, now);
  const ip = await keyed(env, 'ip', request.headers.get('CF-Connecting-IP') || 'unknown');
  const recent = await db(env).prepare('SELECT COUNT(*) AS count FROM flash_report_requests WHERE ip_hash = ? AND created_at > ?')
    .bind(ip, now - 60 * 60 * 1000).first();
  if (recent.count >= 10) return refuse('Too many report requests. Try again later.', 429);
  await db(env).prepare(`INSERT INTO flash_report_requests
    (id, poll_hash, approval_hash, state, created_at, request_expires, ip_hash)
    VALUES (?, ?, ?, 'pending', ?, ?, ?)`).bind(id, await digest(poll), await digest(approval), now, now + REQUEST_TTL, ip).run();
  const approval_url = new URL('/flash-report/approve/', request.url);
  approval_url.searchParams.set('id', id);
  approval_url.searchParams.set('token', approval);
  return reply({id, poll_token: poll, approval_url: approval_url.toString()});
}

export async function approveRequest({request, env, params}, now = Date.now()) {
  if (request.method !== 'POST') return refuse('Use POST.', 405);
  if (!configured(env)) return refuse('Report submission is unavailable.', 503);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return refuse('Invalid origin.', 403);
  let data;
  try {
    const bytes = await boundedBytes(request, 4096);
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return refuse('Invalid approval.'); }
  if (!data || !['session', 'all'].includes(data.scope) || !/^[0-9a-f]{64}$/.test(data.token ?? '')) return refuse('Invalid approval.');
  const record = await row(env, params.id);
  if (!record || record.state !== 'pending' || record.request_expires < now || await digest(data.token) !== record.approval_hash) return refuse('Approval expired or invalid.', 403);
  const upload = await keyed(env, 'upload', params.id);
  const updated = await db(env).prepare(`UPDATE flash_report_requests SET scope = ?, state = 'approved', upload_hash = ?, upload_expires = ?, approval_hash = ''
    WHERE id = ? AND state = 'pending' AND request_expires >= ?`).bind(data.scope, await digest(upload), now + UPLOAD_TTL, params.id, now).run();
  if (updated.meta?.changes !== 1) return refuse('Approval already used.', 409);
  return reply({approved: true, scope: data.scope});
}

export async function pollRequest({request, env, params}, now = Date.now()) {
  if (request.method !== 'GET') return refuse('Use GET.', 405);
  if (!configured(env)) return refuse('Report submission is unavailable.', 503);
  const record = await authorized(request, env, params.id, 'poll_hash');
  if (!record || record.request_expires < now) return refuse('Request expired or invalid.', 403);
  if (record.state === 'pending') return new Response(null, {status: 202, headers: {'Cache-Control': 'no-store'}});
  if (record.state !== 'approved') return refuse('Request already used.', 409);
  const upload = await keyed(env, 'upload', params.id);
  return reply({scope: record.scope, upload_token: upload});
}

// New clients attach the user-written description after browser approval and
// before the ZIP upload. Older clients remain valid and leave this field blank.
export async function saveDescription({request, env, params}, now = Date.now()) {
  if (request.method !== 'PUT') return refuse('Use PUT.', 405);
  if (!configured(env)) return refuse('Report submission is unavailable.', 503);
  const record = await authorized(request, env, params.id, 'upload_hash');
  if (!record || !['approved', 'uploaded'].includes(record.state) || record.upload_expires < now || record.notified) return refuse('Upload expired or invalid.', 403);
  if (request.headers.get('Content-Length') && Number(request.headers.get('Content-Length')) > 100 * 1024) return refuse('Description too large.', 413);
  let data;
  try {
    const bytes = await boundedBytes(request, 100 * 1024);
    if (!bytes) return refuse('Description too large.', 413);
    data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  } catch { return refuse('Invalid description.'); }
  if (typeof data?.description !== 'string' || new TextEncoder().encode(data.description).byteLength > 16 * 1024 || !data.description.trim()) return refuse('A report description is required.');
  const updated = await db(env).prepare(`UPDATE flash_report_requests SET description = ?
    WHERE id = ? AND state IN ('approved', 'uploaded') AND notified = 0`).bind(data.description, params.id).run();
  if (updated.meta?.changes !== 1) return refuse('Upload expired or invalid.', 403);
  return reply({saved: true});
}

async function notify(env, record, downloadToken, request) {
  const url = new URL(`/api/flash-reports/download/${record.id}`, request.url);
  url.searchParams.set('token', downloadToken);
  const response = await env.FIRMWARE_EMAIL_SERVICE.fetch('https://firmware-email.internal/', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({type: 'flash-report', report_id: record.id, url: url.toString(), scope: record.scope, description: record.description || ''}),
  });
  if (!response.ok || !(await response.json()).sent) throw new Error('Email delivery failed');
  await db(env).prepare("UPDATE flash_report_requests SET notified = 1, upload_hash = '' WHERE id = ? AND notified = 0").bind(record.id).run();
}

export async function uploadBundle({request, env, params}, now = Date.now()) {
  if (request.method !== 'PUT') return refuse('Use PUT.', 405);
  if (!configured(env)) return refuse('Report submission is unavailable.', 503);
  const record = await authorized(request, env, params.id, 'upload_hash');
  if (!record || !['approved', 'uploaded'].includes(record.state) || record.upload_expires < now) return refuse('Upload expired or invalid.', 403);
  const downloadToken = await keyed(env, 'download', params.id);
  if (record.state === 'uploaded') {
    if (record.notified) return refuse('Upload already used.', 409);
    try { await notify(env, record, downloadToken, request); }
    catch { return refuse('Report saved, but notification email failed. Please retry.', 503); }
    return reply({report_id: params.id, retained_until_ms: record.uploaded_at + RETAIN});
  }
  if (request.headers.get('Content-Type') !== 'application/zip') return refuse('Expected a ZIP.', 415);
  const size = Number(request.headers.get('Content-Length'));
  if (!Number.isFinite(size) || size <= 0 || size > MAX_ZIP) return refuse('Report ZIP exceeds 50 MiB.', 413);
  const body = await boundedBytes(request, MAX_ZIP);
  if (!body) return refuse('Report ZIP exceeds 50 MiB.', 413);
  if (body.byteLength !== size || body.byteLength > MAX_ZIP) return refuse('Invalid report size.', 413);
  const sha256 = await digest(body);
  if (sha256 !== request.headers.get('X-Content-SHA256')) return refuse('Report checksum mismatch.');
  if (new Uint8Array(body)[0] !== 0x50 || new Uint8Array(body)[1] !== 0x4b) return refuse('Invalid ZIP.');
  // A unique object key prevents a losing concurrent upload from deleting the
  // winning report while it rolls back its own orphaned object.
  const key = `flash-reports/${record.id}/${crypto.randomUUID()}.zip`;
  await env.FLASH_REPORTS_BUCKET.put(key, body, {httpMetadata: {contentType: 'application/zip'},
    customMetadata: {expires_at_ms: String(now + RETAIN)}});
  const updated = await db(env).prepare(`UPDATE flash_report_requests SET state = 'uploaded',
    download_hash = ?, uploaded_at = ?, object_key = ?, byte_length = ?, sha256 = ? WHERE id = ? AND state = 'approved'`)
    .bind(await digest(downloadToken), now, key, body.byteLength, sha256, params.id).run();
  if (updated.meta?.changes !== 1) { await env.FLASH_REPORTS_BUCKET.delete(key); return refuse('Upload already used.', 409); }
  try { await notify(env, {...record, id: params.id}, downloadToken, request); }
  catch { return refuse('Report saved, but notification email failed. Please retry.', 503); }
  return reply({report_id: params.id, retained_until_ms: now + RETAIN});
}

export async function downloadBundle({request, env, params}, now = Date.now()) {
  if (request.method !== 'GET') return refuse('Use GET.', 405);
  if (!env.FIRMWARE_VERIFICATIONS || !env.FLASH_REPORTS_BUCKET) return refuse('Report download is unavailable.', 503);
  const access = new URL(request.url).searchParams.get('token');
  const record = await row(env, params.id);
  if (!record || record.state !== 'uploaded' || !/^[0-9a-f]{64}$/.test(access ?? '') || await digest(access) !== record.download_hash) return refuse('Report not found.', 404);
  if (record.uploaded_at + RETAIN < now) {
    await env.FLASH_REPORTS_BUCKET.delete(record.object_key);
    return refuse('Report expired.', 410);
  }
  const object = await env.FLASH_REPORTS_BUCKET.get(record.object_key);
  if (!object) return refuse('Report expired.', 410);
  return new Response(object.body, {headers: {'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="freemkv-report-${record.id}.zip"`,
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'}});
}
