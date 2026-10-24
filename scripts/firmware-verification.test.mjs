import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {firmwareVerification} from '../src/lib/firmware-verification.mjs';
import {verificationKey, verificationCatalog} from '../src/lib/firmware-verification-catalog.mjs';
import emailWorker from '../workers/firmware-email.mjs';

class D1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(readFileSync(new URL('../migrations/0001_firmware_verification.sql', import.meta.url), 'utf8'));
  }
  prepare(sql) {
    const db = this;
    return {args: [], bind(...args) { return {...this, args}; },
      async all() { return db.execute(sql, this.args); },
      async run() { return db.execute(sql, this.args); },
      async first() { return db.execute(sql, this.args).results[0] ?? null; },
      execute() { return db.execute(sql, this.args); }};
  }
  execute(sql, args) {
    const results = this.sqlite.prepare(sql).all(...args);
    return {results, meta: {changes: this.sqlite.prepare('SELECT changes() AS n').get().n}};
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try { const result = statements.map(s => s.execute()); this.sqlite.exec('COMMIT'); return result; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
function fixture() {
  const catalog = new Map([
    ['a', {label: 'Drive A 1.00', targets: new Set(['b'])}],
    ['b', {label: 'Drive B 2.00', targets: new Set(['a'])}],
    ['c', {label: 'Drive C 3.00', targets: new Set(['b'])}],
  ]);
  const env = {FIRMWARE_VERIFICATIONS: new D1(), FIRMWARE_VERIFICATION_SECRET: 'private-secret-with-at-least-32-bytes',
    FIRMWARE_TURNSTILE_SECRET: 'turnstile-secret', FIRMWARE_EMAIL_ACCOUNT_ID: 'account',
    FIRMWARE_EMAIL_TOKEN: 'email-token'};
  const state = {time: 1800000000000, mail: [], turnstile: true, email: true};
  const fetcher = async (url, options) => {
    if (url.includes('siteverify')) return Response.json({success: state.turnstile, action: 'firmware-verification', hostname: 'freemkv.org'});
    assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/account/email/sending/send');
    assert.equal(options.headers.Authorization, 'Bearer email-token');
    const mail = JSON.parse(options.body); assert.equal(mail.from, 'noreply@freemkv.org'); state.mail.push(mail);
    return Response.json({success: state.email, result: {delivered: state.email ? [mail.to] : []}});
  };
  const call = async (body, cookie = '', headers = {}) => {
    const request = new Request('https://freemkv.org/api/firmware-verification', {method: 'POST', headers: {
      'Content-Type': 'application/json', Origin: 'https://freemkv.org', 'CF-Connecting-IP': '192.0.2.5', Cookie: cookie, ...headers,
    }, body: JSON.stringify(body)});
    const response = await firmwareVerification(request, env, catalog, {fetcher, now: () => state.time});
    return {status: response.status, cookie: response.headers.get('Set-Cookie')?.split(';')[0], data: await response.json()};
  };
  const requestCode = async (email = 'person@example.com', scope = {target: 'b', source: ''}) => {
    const response = await call({action: 'request', ...scope, email, token: 'captcha'});
    assert.equal(response.status, 200, JSON.stringify(response.data));
    return {challenge: response.data.challenge, code: state.mail.at(-1).text.slice(0, 6)};
  };
  const login = async (email, scope) => {
    const code = await requestCode(email, scope);
    const result = await call({action: 'authenticate', ...code});
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.cookie;
  };
  const count = async (target = 'b', source = '') => (await call({action: 'counts', scopes: [{target, source}]})).data.counts[0];
  return {env, state, call, login, requestCode, count};
}

test('counts deduplicate email across direct and directed crossflash reports; removal preserves other support', async () => {
  const f = fixture(), first = await f.login(' Alice@Example.com '), second = await f.login('bob@example.com');
  const add = (cookie, source = '') => f.call({action: 'add', target: 'b', source}, cookie);
  const remove = (source = '') => f.call({action: 'remove', target: 'b', source}, first);
  assert.equal(await f.count(), 0);
  await Promise.all([add(first, 'a'), add(first, 'a')]);
  assert.equal(await f.count('b', 'a'), 1);
  assert.equal(await f.count(), 1);
  await add(first, 'c'); await add(first); await add(second);
  assert.equal(await f.count(), 2);
  assert.equal(await f.count('b', 'c'), 1);
  await remove('a'); assert.equal(await f.count('b', 'a'), 0); assert.equal(await f.count(), 2);
  await remove('c'); assert.equal(await f.count(), 2);
  await remove(); assert.equal(await f.count(), 1);
  assert.deepEqual((await f.call({action: 'status', target: 'b'}, first)).data.reports, []);
  assert.equal((await f.call({action: 'status', target: 'b'}, second)).data.reports.length, 1);
  assert.equal(await f.count('a', 'b'), 0, 'reverse route is independent');
});

test('existing crossflash reports support both roots without verifying reverse routes or duplicating people', async () => {
  const f = fixture(), cookie = await f.login();
  await f.call({action: 'add', target: 'b', source: 'a'}, cookie);
  assert.equal(await f.count('a'), 1);
  assert.equal(await f.count('b'), 1);
  assert.equal(await f.count('a', 'b'), 0);
  const reports = (await f.call({action: 'status', target: 'a'}, cookie)).data.reports;
  assert.deepEqual(reports, [{target: 'b', source: 'a', label: 'Drive A 1.00 → Drive B 2.00'}]);
  await f.call({action: 'add', target: 'a'}, cookie);
  assert.equal(await f.count('a'), 1);
  await f.call({action: 'remove', target: reports[0].target, source: reports[0].source}, cookie);
  assert.equal(await f.count('a'), 1, 'independent direct confirmation survives route removal');
  assert.equal(await f.count('b'), 0);
  await f.call({action: 'remove', target: 'a'}, cookie);
  assert.equal(await f.count('a'), 0);
});

test('email code authenticates only once, does not itself create a report, and private email is not stored', async () => {
  const f = fixture(), code = await f.requestCode('person@example.com');
  const results = await Promise.all([f.call({action: 'authenticate', ...code}), f.call({action: 'authenticate', ...code})]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  assert.equal(await f.count(), 0);
  const challenge = f.env.FIRMWARE_VERIFICATIONS.sqlite.prepare('SELECT * FROM firmware_challenges').get();
  assert.match(challenge.person, /^[a-f0-9]{64}$/);
  assert.match(challenge.code_mac, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(challenge).includes('person@example.com'));
  assert.ok(!Object.hasOwn(challenge, 'code'));
  const unauthenticated = await f.call({action: 'add', target: 'b', email: 'person@example.com'});
  assert.equal(unauthenticated.status, 401);
});

test('session lasts exactly 60 minutes and can confirm other firmware without another email', async () => {
  const f = fixture(), cookie = await f.login();
  f.state.time += 59 * 60000;
  assert.equal((await f.call({action: 'add', target: 'a'}, cookie)).status, 200);
  assert.equal((await f.call({action: 'add', target: 'b', source: 'a'}, cookie)).status, 200);
  assert.equal(f.state.mail.length, 1);
  f.state.time += 60000;
  assert.equal((await f.call({action: 'remove', target: 'a'}, cookie)).status, 401);
  assert.equal(await f.count('a'), 1, 'report does not expire with the session');
});

test('codes expire in ten minutes and wrong attempts are atomically capped at five', async () => {
  const expired = fixture(), code = await expired.requestCode();
  expired.state.time += 600000;
  assert.equal((await expired.call({action: 'authenticate', ...code})).status, 400);
  const f = fixture(), active = await f.requestCode();
  const wrong = active.code === '000000' ? '111111' : '000000';
  const attempts = await Promise.all(Array.from({length: 8}, () => f.call({action: 'authenticate', ...active, code: wrong})));
  assert.ok(attempts.every(r => r.status === 400));
  assert.equal(f.env.FIRMWARE_VERIFICATIONS.sqlite.prepare('SELECT attempts FROM firmware_challenges').get().attempts, 5);
  assert.equal((await f.call({action: 'authenticate', ...active})).status, 400);
});

test('new code after session expiry permits removal; another email cannot remove the report', async () => {
  const f = fixture(), alice = await f.login('alice@example.com'), bob = await f.login('bob@example.com');
  await f.call({action: 'add', target: 'b', source: 'a'}, alice);
  await f.call({action: 'remove', target: 'b', source: 'a'}, bob);
  assert.equal(await f.count(), 1);
  f.state.time += 3600001;
  const returned = await f.login('ALICE@example.com');
  const reports = await f.call({action: 'status', target: 'b'}, returned);
  assert.equal(reports.data.reports[0].source, 'a');
  await f.call({action: 'remove', target: 'b', source: 'a'}, returned);
  assert.equal(await f.count(), 0);
});

test('request limits, anti-bot check and email failure do not create confirmations', async () => {
  const f = fixture(); f.state.turnstile = false;
  assert.equal((await f.call({action: 'request', target: 'b', email: 'x@example.com', token: 'bad'})).status, 403);
  assert.equal(f.state.mail.length, 0);
  f.state.turnstile = true;
  await f.requestCode();
  assert.equal((await f.call({action: 'request', target: 'b', email: 'person@example.com', token: 'good'})).status, 429);
  f.state.time += 60000; f.state.email = false;
  assert.equal((await f.call({action: 'request', target: 'b', email: 'other@example.com', token: 'good'})).status, 503);
  assert.equal(await f.count(), 0);
});

test('real counts remain available without email delivery; requesting a code fails clearly', async () => {
  const f = fixture();
  const cookie = await f.login('person@example.com', {target: 'b', source: 'a'});
  await f.call({action: 'add', target: 'b', source: 'a'}, cookie);
  delete f.env.FIRMWARE_EMAIL_TOKEN;
  assert.deepEqual((await f.call({action: 'counts', scopes: [{target: 'b'}, {target: 'b', source: 'a'}]})).data.counts, [1, 1]);
  assert.equal((await f.call({action: 'status', target: 'b'}, cookie)).status, 200);
  const result = await f.call({action: 'request', target: 'b', email: 'other@example.com', token: 'good'});
  assert.equal(result.status, 503);
  assert.equal(result.data.error, 'Email verification is temporarily unavailable.');
  assert.equal(f.state.mail.length, 1);
});

test('private native email service delivers the fixed code message without API credentials', async () => {
  const f = fixture(); delete f.env.FIRMWARE_EMAIL_TOKEN; delete f.env.FIRMWARE_EMAIL_ACCOUNT_ID;
  const sent = [];
  f.env.FIRMWARE_EMAIL_SERVICE = {fetch: (url, init) => emailWorker.fetch(new Request(url, init), {
    EMAIL: {send: async message => { sent.push(message); return {messageId: 'native-message'}; }},
  })};
  const result = await f.call({action: 'request', target: 'b', email: 'person@example.com', token: 'good'});
  assert.equal(result.status, 200);
  assert.equal(sent.length, 1); assert.equal(sent[0].from, 'noreply@freemkv.org');
  assert.match(sent[0].text, /^\d{6}\n\nDrive B 2.00/);
  const code = sent[0].text.slice(0, 6);
  assert.equal((await f.call({action: 'authenticate', challenge: result.data.challenge, code})).status, 200);
  const invalid = await emailWorker.fetch(new Request('https://internal/', {method: 'POST', body: JSON.stringify({email: 'bad', code, label: 'x'})}), {});
  assert.equal(invalid.status, 400);
  f.env.FIRMWARE_EMAIL_SERVICE = {fetch: async () => new Response(null, {status: 503})};
  f.state.time += 60000;
  assert.equal((await f.call({action: 'request', target: 'b', email: 'other@example.com', token: 'good'})).status, 503);
});

test('private email service sends a flash report link only to the configured maintainer', async () => {
  const sent = [];
  const env = {REPORT_TO: 'maintainer@example.com', EMAIL: {send: async message => {
    sent.push(message); return {messageId: 'report-message'};
  }}};
  const report_id = '01234567-89ab-4cde-8fab-0123456789ab';
  const url = `https://freemkv.org/api/flash-reports/download/${report_id}?token=${'a'.repeat(64)}`;
  const send = body => emailWorker.fetch(new Request('https://internal/', {method: 'POST',
    body: JSON.stringify({type: 'flash-report', report_id, scope: 'session', url, ...body})}), env);
  assert.equal((await send({})).status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'maintainer@example.com');
  assert.match(sent[0].text, /session flash report/);
  assert.match(sent[0].text, /expires after 90 days/);
  assert.equal((await send({url: url.replace('freemkv.org', 'other.example')})).status, 400);
  assert.equal((await send({scope: 'invalid'})).status, 400);
  assert.equal(sent.length, 1);
});

test('unknown/unsupported routes, other origins, missing setup, oversized and invalid requests fail closed', async () => {
  const f = fixture();
  assert.equal((await f.call({action: 'counts', scopes: [{target: 'missing'}]})).status, 400);
  assert.equal((await f.call({action: 'request', target: 'c', source: 'a', email: 'x@example.com', token: 'good'})).status, 400);
  assert.equal((await f.call({action: 'counts', scopes: []}, '', {Origin: 'https://other.example'})).status, 403);
  assert.equal((await f.call({action: 'counts', scopes: []}, '', {'Content-Length': '100000'})).status, 413);
  f.env.FIRMWARE_VERIFICATION_SECRET = '';
  assert.equal((await f.call({action: 'counts', scopes: []})).status, 503);
});

test('verification identities survive repacking and distinguish changed firmware bytes', () => {
  const id = {key: 'pioneer:9201:ID43'};
  const pkg = {kernelSha256: 'a'.repeat(64), normalSha256: 'b'.repeat(64), sha256: 'old-tar'};
  const key = verificationKey(id, '1.60', pkg);
  assert.equal(verificationKey(id, '1.60', {...pkg, sha256: 'new-tar'}), key);
  assert.notEqual(verificationKey(id, '1.60', {...pkg, kernelSha256: 'c'.repeat(64)}), key);
  assert.notEqual(verificationKey({...id, key: 'pioneer:9201:ID88'}, '1.60', pkg), key);
  assert.equal(verificationKey(id, '1.60', {}), null);
});

test('Future and incomplete routes never enter the verification API allowlist', () => {
  const page = {identities: [{brand: 'Pioneer', n: 'A', x: [['B', 0, [[1, 1, 0], [2, 2, 0, 1], [3, 3, 1]]]]},
    {brand: 'Pioneer', n: 'B', x: []}, {brand: 'Pioneer', n: 'C', x: []}, {brand: 'Pioneer', n: 'D', x: []}],
    versions: ['a', 'b', 'c', 'd'].map((verification, i) => ({i, r: '1.00', verification}))};
  const catalog = verificationCatalog(page);
  assert.deepEqual([...catalog.get('a').targets], ['b']);
});
