const COOKIE = '__Host-firmware-verification';
const HOUR = 3600;
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Cookie', ...headers},
});
class Refusal extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
async function mac(secret, purpose, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${purpose}\0${value}`)));
}
function emailAddress(value) {
  const email = typeof value === 'string' ? value.trim().normalize('NFC').toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Refusal('Enter a valid email address.');
  return email;
}
function scopeOf(body, catalog) {
  const target = typeof body.target === 'string' ? body.target : '';
  const source = typeof body.source === 'string' ? body.source : '';
  if (!catalog.has(target) || (source && (!catalog.has(source) || !catalog.get(source).targets.has(target)))) {
    throw new Refusal('This firmware or crossflash is not listed.');
  }
  return {target, source};
}
const scopeLabel = (scope, catalog) => scope.source
  ? `${catalog.get(scope.source).label} → ${catalog.get(scope.target).label}` : catalog.get(scope.target).label;
async function session(request, env, now) {
  const value = request.headers.get('Cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  const token = await mac(env.FIRMWARE_VERIFICATION_SECRET, 'session', value);
  return env.FIRMWARE_VERIFICATIONS.prepare('SELECT person FROM firmware_verification_sessions WHERE token_mac = ? AND expires > ?').bind(token, now).first();
}
async function counts(db, scope) {
  return (await db.prepare(`SELECT COUNT(DISTINCT person) AS count FROM firmware_confirmations
    WHERE target = ? AND (? = '' OR source = ?)`).bind(scope.target, scope.source, scope.source).first()).count;
}
async function ownReports(db, person, scope, catalog) {
  const {results} = await db.prepare(`SELECT source FROM firmware_confirmations
    WHERE person = ? AND target = ? AND (? = '' OR source = ?) ORDER BY source`)
    .bind(person, scope.target, scope.source, scope.source).all();
  return results.map(({source}) => ({source, label: source && catalog.has(source) ? catalog.get(source).label : ''}));
}
async function rate(db, key, bucket, limit) {
  const row = await db.prepare(`INSERT INTO firmware_verification_limits(key, bucket, count) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET bucket = excluded.bucket,
    count = CASE WHEN bucket = excluded.bucket THEN count + 1 ELSE 1 END
    WHERE bucket != excluded.bucket OR count < ? RETURNING count`).bind(key, bucket, limit).first();
  if (!row) throw new Refusal('Too many codes requested. Please try again later.', 429);
}
async function challengeToken(request, env, token, fetcher) {
  if (!env.FIRMWARE_TURNSTILE_SECRET) throw new Refusal('Verification is temporarily unavailable.', 503);
  if (typeof token !== 'string' || !token || token.length > 4096) throw new Refusal('Please complete the verification check.', 403);
  const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({secret: env.FIRMWARE_TURNSTILE_SECRET, response: token,
      remoteip: request.headers.get('CF-Connecting-IP') || ''}), signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || !result.success || result.action !== 'firmware-verification' || result.hostname !== new URL(request.url).hostname) {
    throw new Refusal('Verification check failed. Please try again.', 403);
  }
}
async function sendCode(email, code, label, env, fetcher) {
  if (!env.FIRMWARE_EMAIL_ACCOUNT_ID || !env.FIRMWARE_EMAIL_TOKEN) {
    throw new Refusal('Email verification is temporarily unavailable.', 503);
  }
  const account = encodeURIComponent(env.FIRMWARE_EMAIL_ACCOUNT_ID);
  const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}/email/sending/send`, {
    method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${env.FIRMWARE_EMAIL_TOKEN}`},
    body: JSON.stringify({to: email, from: 'noreply@freemkv.org', subject: 'Your freemkv verification code',
      text: `${code}\n\n${label}\n\nThis code expires in 10 minutes. If you did not request it, ignore this email.`}),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || !result.success || result.result?.permanent_bounces?.includes(email)) {
    throw new Refusal('The code could not be sent. Please try again later.', 503);
  }
}
async function boundedBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Refusal('Invalid request.');
  const chunks = []; let length = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 65536) { await reader.cancel(); throw new Refusal('Request too large.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

// D1 owns uniqueness, one-use codes and rate limits; no read/increment counters.
// Only salted email identities are persisted. Email and codes never enter logs.
export async function firmwareVerification(request, env, catalog, {fetcher = fetch, now = () => Date.now()} = {}) {
  try {
    if (request.method !== 'POST') return json({error: 'Use POST.'}, 405, {Allow: 'POST'});
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) throw new Refusal('Invalid origin.', 403);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Refusal('Expected JSON.', 415);
    if (Number(request.headers.get('Content-Length')) > 65536) throw new Refusal('Request too large.', 413);
    const text = await boundedBody(request);
    let body;
    try { body = JSON.parse(text); } catch { throw new Refusal('Invalid request.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Refusal('Invalid request.');
    if (!env.FIRMWARE_VERIFICATIONS || typeof env.FIRMWARE_VERIFICATION_SECRET !== 'string' || env.FIRMWARE_VERIFICATION_SECRET.length < 32 ||
      !env.FIRMWARE_EMAIL_ACCOUNT_ID || !env.FIRMWARE_EMAIL_TOKEN) {
      throw new Refusal('Verification is temporarily unavailable.', 503);
    }
    const db = env.FIRMWARE_VERIFICATIONS, time = Math.floor(now() / 1000);
    if (body.action === 'counts') {
      if (!Array.isArray(body.scopes) || body.scopes.length > 80) throw new Refusal('Too many firmware entries.');
      const scopes = body.scopes.map(s => scopeOf(s, catalog));
      return json({counts: await Promise.all(scopes.map(s => counts(db, s)))});
    }
    if (body.action === 'request') {
      const scope = scopeOf(body, catalog), email = emailAddress(body.email);
      await challengeToken(request, env, body.token, fetcher);
      const person = await mac(env.FIRMWARE_VERIFICATION_SECRET, 'email', email);
      const ip = await mac(env.FIRMWARE_VERIFICATION_SECRET, 'ip', request.headers.get('CF-Connecting-IP') || 'unknown');
      await rate(db, `ip:${ip}`, Math.floor(time / HOUR), 20);
      await rate(db, `person:${person}`, Math.floor(time / HOUR), 5);
      await rate(db, `resend:${person}`, Math.floor(time / 60), 1);
      await db.batch([
        db.prepare('DELETE FROM firmware_challenges WHERE expires < ?').bind(time - HOUR),
        db.prepare('DELETE FROM firmware_verification_sessions WHERE expires <= ?').bind(time),
        db.prepare('DELETE FROM firmware_verification_limits WHERE bucket < ? AND key NOT LIKE ?').bind(Math.floor(time / HOUR) - 24, 'resend:%'),
        db.prepare('DELETE FROM firmware_verification_limits WHERE bucket < ? AND key LIKE ?').bind(Math.floor(time / 60) - 1440, 'resend:%'),
      ]);
      const id = crypto.randomUUID();
      let number;
      do { number = crypto.getRandomValues(new Uint32Array(1))[0]; } while (number >= 4294000000);
      const code = String(number % 1000000).padStart(6, '0');
      const codeMac = await mac(env.FIRMWARE_VERIFICATION_SECRET, 'code', `${id}:${code}`);
      await db.prepare(`INSERT INTO firmware_challenges(id, person, target, source, code_mac, expires, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, person, scope.target, scope.source, codeMac, time + 600, time).run();
      try { await sendCode(email, code, scopeLabel(scope, catalog), env, fetcher); }
      catch (error) { await db.prepare('DELETE FROM firmware_challenges WHERE id = ?').bind(id).run(); throw error; }
      return json({challenge: id});
    }
    if (body.action === 'authenticate') {
      if (typeof body.challenge !== 'string' || !/^[a-f0-9-]{36}$/.test(body.challenge) || !/^\d{6}$/.test(body.code)) throw new Refusal('Enter the six-digit code.');
      const codeMac = await mac(env.FIRMWARE_VERIFICATION_SECRET, 'code', `${body.challenge}:${body.code}`);
      const token = randomToken(), tokenMac = await mac(env.FIRMWARE_VERIFICATION_SECRET, 'session', token);
      const result = await db.batch([
        db.prepare(`UPDATE firmware_challenges SET attempts = attempts + 1,
          state = CASE WHEN code_mac = ? THEN 1 ELSE 0 END
          WHERE id = ? AND state = 0 AND expires > ? AND attempts < 5 RETURNING person, state`)
          .bind(codeMac, body.challenge, time),
        db.prepare(`INSERT INTO firmware_verification_sessions(token_mac, person, expires)
          SELECT ?, person, ? FROM firmware_challenges
          WHERE id = ? AND state = 1 AND code_mac = ? AND changes() = 1`)
          .bind(tokenMac, time + HOUR, body.challenge, codeMac),
      ]);
      if (!result[0].results?.[0]?.state || result[1].meta.changes !== 1) throw new Refusal('Code invalid or expired. Request a new code.');
      return json({authenticated: true}, 200, {'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Strict`});
    }
    const scope = scopeOf(body, catalog);
    const owner = await session(request, env, time);
    if (!owner) throw new Refusal('Confirm your email to continue.', 401);
    if (body.action === 'status') return json({reports: await ownReports(db, owner.person, scope, catalog)});
    if (body.action === 'add') {
      await db.prepare(`INSERT INTO firmware_confirmations(person, target, source, confirmed_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(person, target, source) DO NOTHING`).bind(owner.person, scope.target, scope.source, time).run();
    } else if (body.action === 'remove') {
      await db.prepare('DELETE FROM firmware_confirmations WHERE person = ? AND target = ? AND source = ?')
        .bind(owner.person, scope.target, scope.source).run();
    } else throw new Refusal('Unknown action.');
    return json({count: await counts(db, scope), reports: await ownReports(db, owner.person, scope, catalog)});
  } catch (error) {
    return json({error: error instanceof Refusal ? error.message : 'Verification is temporarily unavailable.'}, error instanceof Refusal ? error.status : 503);
  }
}
