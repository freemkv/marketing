import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {firmwareVerification} from '../src/lib/firmware-verification.mjs';
import {verificationKey, verificationCatalog} from '../src/lib/firmware-verification-catalog.mjs';
import {verificationHashParts} from '../public/firmware-verification-hashes.js';
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
function fixture({catalog: allowedCatalog, database = new D1()} = {}) {
  const catalog = allowedCatalog ?? new Map([
    ['a', {label: 'Drive A 1.00', targets: new Set(['b'])}],
    ['b', {label: 'Drive B 2.00', targets: new Set(['a'])}],
    ['c', {label: 'Drive C 3.00', targets: new Set(['b'])}],
  ]);
  const env = {FIRMWARE_VERIFICATIONS: database, FIRMWARE_VERIFICATION_SECRET: 'private-secret-with-at-least-32-bytes',
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

test('crossflash independently confirms its source and removal only removes the selected confirmation', async () => {
  const f = fixture(), cookie = await f.login();
  await f.call({action: 'add', target: 'b', source: 'a'}, cookie);
  await f.call({action: 'add', target: 'b', source: 'a'}, cookie);
  assert.equal(await f.count('a'), 1);
  assert.equal(await f.count('b'), 1);
  assert.equal(await f.count('a', 'b'), 0);
  assert.deepEqual((await f.call({action: 'status', target: 'a'}, cookie)).data.reports, [{source: '', label: ''}]);
  await f.call({action: 'remove', target: 'b', source: 'a'}, cookie);
  assert.equal(await f.count('a'), 1, 'source remains verified after crossflash removal');
  assert.equal(await f.count('b', 'a'), 0);
  assert.equal(await f.count('b'), 0);
  await f.call({action: 'add', target: 'b', source: 'a'}, cookie);
  await f.call({action: 'remove', target: 'a'}, cookie);
  assert.equal(await f.count('a'), 0, 'source can be removed independently');
  assert.equal(await f.count('b', 'a'), 1, 'removing source leaves crossflash intact');
});

test('historical source backfill deduplicates and never resurrects explicitly removed confirmations', () => {
  const db = new D1().sqlite;
  db.exec("INSERT INTO firmware_confirmations VALUES ('p','b','a',10), ('p','c','a',20), ('q','b','a',30)");
  const sql = readFileSync(new URL('../migrations/0003_crossflash_source_confirmations.sql', import.meta.url), 'utf8');
  db.exec(sql);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM firmware_confirmations WHERE target='a' AND source=''").get().n, 2);
  assert.equal(db.prepare("SELECT confirmed_at AS t FROM firmware_confirmations WHERE person='p' AND target='a' AND source=''").get().t, 10);
  db.exec("DELETE FROM firmware_confirmations WHERE person='p' AND target='a' AND source=''");
  db.exec(sql);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM firmware_confirmations WHERE target='a' AND source=''").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM firmware_confirmations WHERE source='a'").get().n, 3);
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
  assert.equal((await send({description: 'First line\r\nSecond line\u0000\n<plain text>'})).status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'maintainer@example.com');
  assert.match(sent[0].text, /session flash report/);
  assert.match(sent[0].text, /Description:\nFirst line\nSecond line\n<plain text>/);
  assert.match(sent[0].text, /expires after 90 days/);
  assert.equal((await send({url: url.replace('freemkv.org', 'other.example')})).status, 400);
  assert.equal((await send({scope: 'invalid'})).status, 400);
  assert.equal((await send({description: ' \n '})).status, 400);
  assert.equal((await send({description: 'x'.repeat(16 * 1024 + 1)})).status, 400);
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

test('FW2 verification keys follow exact firmware bytes, independent of identity and revision', () => {
  const id = {family: 'pioneer', key: 'pioneer:9201:ID43'};
  const pkg = {kernelSha256: 'a'.repeat(64), normalSha256: 'b'.repeat(64), sha256: 'old-tar'};
  const key = verificationKey(id, '1.60', pkg);
  assert.equal(key, `fw2|pioneer|${'a'.repeat(64)}:${'b'.repeat(64)}`);
  assert.equal(verificationKey(id, '1.60', {...pkg, sha256: 'new-tar'}), key);
  assert.notEqual(verificationKey(id, '1.60', {...pkg, kernelSha256: 'c'.repeat(64)}), key);
  assert.notEqual(verificationKey(id, '1.61', {...pkg, normalSha256: 'c'.repeat(64)}), key);
  assert.equal(verificationKey({...id, key: 'pioneer:9201:ID88'}, '2.00', pkg), key);
  const image = 'd'.repeat(64);
  assert.equal(verificationKey({family: 'mediatek', key: 'mediatek:OmniDrive:GENERAL'}, '1.00', {imageSha256: image}), `fw2|mediatek|${image}`);
  assert.equal(verificationKey({family: 'mediatek', key: 'mediatek:OEM:GENERAL'}, '1.00', {imageSha256: image}), `fw2|mediatek|${image}`);
  assert.notEqual(verificationKey({family: 'mediatek', key: 'mediatek:OmniDrive:GENERAL'}, '1.00', {imageSha256: image}),
    verificationKey({family: 'mediatek', key: 'mediatek:OEM:GENERAL'}, '1.00', {imageSha256: 'e'.repeat(64)}));
  assert.equal(verificationKey({key: 'mediatek:raw:GENERAL'}, '1.00', {packageType: 'mediatek-image', sha256: image}), `fw2|mediatek|${image}`);
  assert.equal(verificationKey({key: 'mediatek:tar:GENERAL'}, '1.00', {packageType: 'mediatek-installer', sha256: image}), null);
  assert.equal(verificationKey({key: 'mediatek:bad:GENERAL'}, '1.00', {imageSha256: 'D'.repeat(64)}), null);
  assert.equal(verificationKey({family: 'pioneer', key: 'pioneer:normal-only'}, '1.00', {normalSha256: 'b'.repeat(64)}), `fw2|pioneer|:${'b'.repeat(64)}`);
  assert.equal(verificationKey({family: 'pioneer', key: 'pioneer:invalid'}, '1.00', {kernelSha256: 'A'.repeat(64), normalSha256: 'b'.repeat(64)}), null);
  assert.equal(verificationKey(id, '1.60', {}), null);
});

test('verification dialog hash details expose only validated FW2 content hashes', () => {
  const image = 'a'.repeat(64), kernel = 'b'.repeat(64), normal = 'c'.repeat(64);
  assert.deepEqual(verificationHashParts(`fw2|mediatek|${image}`), [['Image SHA-256', image]]);
  assert.deepEqual(verificationHashParts(`fw2|pioneer|${kernel}:${normal}`), [['Kernel SHA-256', kernel], ['Normal SHA-256', normal]]);
  assert.deepEqual(verificationHashParts(`fw2|pioneer|:${normal}`), [['Normal SHA-256', normal]]);
  for (const invalid of [undefined, 'fw1|mediatek|x', `fw2|mediatek|${'A'.repeat(64)}`, `fw2|pioneer|${kernel}:`, `fw2|other|${image}`]) {
    assert.deepEqual(verificationHashParts(invalid), []);
  }
  const script = readFileSync(new URL('../public/firmware-verification.js', import.meta.url), 'utf8');
  assert.match(script, /add\(scope\.source \? 'Crossflash target' : 'Firmware being verified', scope\.target\)/);
  assert.match(script, /if \(scope\.source\) add\('Crossflash source', scope\.source\)/);
});

test('FW1 confirmations backfill to FW2 by validated content hash without resurrection', async () => {
  const mappings = [
    ['mediatek:ASUS BC-12B1ST b MT1959 JBC6/JB8:ASUS', 'mediatek:ASUS BC-12B1ST MT1959 JBC6/JB8:ASUS', '3.01', '8961b80b005c1b2ba7a8dbc10a4bd3fe6680bd2befcc71de95bd32de34bb4482'],
    ['mediatek:ASUS BC-12B1ST b MT1959 JBC6/JB8:ASUS', 'mediatek:ASUS BC-12B1ST MT1959 JBC6/JB8:ASUS', '3.11', 'ae0c03138570c73d0ba8ed6d7d5e9798ee54e6c22fcb4c815a86eea3301180f6'],
    ['mediatek:hp HLDS BDRE BU40N MT1959 BU5/BU3:HP', 'mediatek:hp HLDS BU40N MT1959 BU5/BU3:HP', 'BW41', '3b9dd9b4c9bd295b1b4cd9d94ce592522588e95a5569f529306b962b337d0e4b'],
    ['mediatek:hp HLDS BDRE BU40N MT1959 BU5/BU3:HP', 'mediatek:hp HLDS BU40N MT1959 BU5/BU3:HP', 'BW42', 'c68cd76b6ca94c077ee7c1fd4ab4ebee06056683158f2259302fd687069e5dca'],
    ['mediatek:hp HLDS BDRE BU50N MT1959 BU51/BU3:HP', 'mediatek:hp HLDS BU50N MT1959 BU51/BU3:HP', 'BW51', 'd1e4d3d704c6f2f8ea200d64ff39e3a1a564769dfa66798039015c615536cf4b'],
  ];
  const fw1 = (identity, revision, digest) => `fw1|${encodeURIComponent(identity)}|${encodeURIComponent(revision)}|${digest}`;
  const fw2 = (family, digest) => `fw2|${family}|${digest}`;
  const renamed = mappings.map(([oldIdentity, newIdentity, revision, digest]) => [
    fw1(oldIdentity, revision, digest), fw1(newIdentity, revision, digest), fw2('mediatek', digest),
  ]);
  const db = new D1(), sqlite = db.sqlite;
  sqlite.exec('CREATE TABLE firmware_data_migrations (name TEXT PRIMARY KEY)');
  const insert = sqlite.prepare('INSERT INTO firmware_confirmations(person, target, source, confirmed_at) VALUES (?, ?, ?, ?)');
  const [oldAsus301, , newAsus301] = renamed[0];
  const [oldAsus311, , newAsus311] = renamed[1];
  const [oldBw41, , newBw41] = renamed[2];
  const [oldBw42, , newBw42] = renamed[3];
  const [oldBw51, , newBw51] = renamed[4];
  const oldAlias = fw1('mediatek:old alias retained', '3.02', '8961b80b005c1b2ba7a8dbc10a4bd3fe6680bd2befcc71de95bd32de34bb4482');
  const omniHash = 'f'.repeat(64), oemHash = 'e'.repeat(64);
  const oldOmni = fw1('mediatek:OmniDrive 1.00:GENERAL', '1.00', omniHash);
  const oldOem = fw1('mediatek:OEM Drive 1.00:GENERAL', '1.00', oemHash);
  const newOmni = fw2('mediatek', omniHash), newOem = fw2('mediatek', oemHash);
  const kernel = '1'.repeat(64), normal = '2'.repeat(64);
  const oldPioneer = fw1('pioneer:9201:ID43', '1.00', `${kernel}:${normal}`);
  const newPioneer = fw2('pioneer', `${kernel}:${normal}`);
  const oldPioneerNormalOnly = fw1('pioneer:9201:ID44', '1.00', `:${normal}`);
  const newPioneerNormalOnly = fw2('pioneer', `:${normal}`);
  insert.run('p', oldAsus301, '', 100);
  insert.run('p', oldAlias, '', 80);
  insert.run('p', newAsus301, '', 90);
  insert.run('q', 'target-q', oldAsus311, 200);
  insert.run('q', 'target-q', newAsus311, 150);
  insert.run('r', oldBw41, oldBw51, 300);
  insert.run('s', oldBw42, '', 400);
  insert.run('omni', oldOmni, '', 500);
  insert.run('oem', oldOem, '', 600);
  insert.run('pioneer', oldPioneer, '', 700);
  insert.run('pioneer-normal-only', oldPioneerNormalOnly, '', 710);
  insert.run('bad', `fw1|mediatek%3Ainvalid|1.00|${'A'.repeat(64)}`, '', 800);
  insert.run('unrelated', 'legacy-unrelated-target', '', 900);

  const sql = readFileSync(new URL('../migrations/0004_content_bound_verification_keys.sql', import.meta.url), 'utf8');
  sqlite.exec(sql);
  const rowsFor = person => sqlite.prepare('SELECT target, source, confirmed_at FROM firmware_confirmations WHERE person = ?').all(person);
  assert.equal(rowsFor('p').find(row => row.target === oldAsus301).confirmed_at, 100, 'old content row remains intact');
  assert.equal(rowsFor('p').filter(row => row.target === newAsus301).length, 1, 'same content and person deduplicate');
  assert.equal(rowsFor('p').find(row => row.target === newAsus301).confirmed_at, 80, 'earliest confirmation is retained');
  assert.equal(rowsFor('q').find(row => row.source === oldAsus311).confirmed_at, 200, 'old source row remains intact');
  assert.equal(rowsFor('q').filter(row => row.source === newAsus311).length, 1, 'source key and duplicate are migrated');
  assert.equal(rowsFor('q').find(row => row.source === newAsus311).confirmed_at, 150);
  assert.deepEqual({...rowsFor('r').find(row => row.target === newBw41 && row.source === newBw51)}, {target: newBw41, source: newBw51, confirmed_at: 300}, 'both directed keys migrate');
  assert.ok(rowsFor('r').some(row => row.target === oldBw41 && row.source === oldBw51), 'original directed row remains');
  assert.ok(rowsFor('s').some(row => row.target === newBw42 && row.confirmed_at === 400));
  assert.ok(rowsFor('pioneer').some(row => row.target === newPioneer && row.confirmed_at === 700));
  assert.ok(rowsFor('pioneer-normal-only').some(row => row.target === newPioneerNormalOnly && row.confirmed_at === 710));
  assert.ok(rowsFor('bad').some(row => row.target.startsWith('fw1|') && row.confirmed_at === 800), 'invalid uppercase digest is not migrated');
  assert.ok(rowsFor('unrelated').some(row => row.target === 'legacy-unrelated-target'));
  assert.notEqual(newOmni, newOem, 'different images with the same revision never merge');
  assert.ok(rowsFor('omni').some(row => row.target === newOmni));
  assert.ok(rowsFor('oem').some(row => row.target === newOem));

  const catalog = new Map([[newOem, {label: 'OEM Drive 1.00', targets: new Set()}]]);
  const api = fixture({catalog, database: db});
  assert.equal(await api.count(newOem), 1);
  assert.equal((await api.call({action: 'counts', scopes: [{target: newOmni, source: ''}]})).status, 400,
    'an orphaned OmniDrive confirmation stays outside the current catalog allowlist');

  sqlite.prepare('DELETE FROM firmware_confirmations WHERE person = ? AND target = ? AND source = ?').run('r', newBw41, newBw51);
  sqlite.exec(sql);
  assert.equal(rowsFor('r').filter(row => row.target === newBw41 && row.source === newBw51).length, 0, 'rerun does not resurrect removed confirmations');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM firmware_data_migrations WHERE name = ?').get('0004_content_bound_verification_keys').count, 1);
});

test('Future and incomplete routes never enter the verification API allowlist', () => {
  const page = {identities: [{brand: 'Pioneer', n: 'A', x: [['B', 0, [[1, 1, 0], [2, 2, 0, 1], [3, 3, 1]]]]},
    {brand: 'Pioneer', n: 'B', x: []}, {brand: 'Pioneer', n: 'C', x: []}, {brand: 'Pioneer', n: 'D', x: []}],
    versions: ['a', 'b', 'c', 'd'].map((verification, i) => ({i, r: '1.00', verification}))};
  const catalog = verificationCatalog(page);
  assert.deepEqual([...catalog.get('a').targets], ['b']);
});
