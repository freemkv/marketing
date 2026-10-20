import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequest, approveRequest, pollRequest, uploadBundle, downloadBundle} from '../src/lib/flash-reports.mjs';

function fixture() {
  const rows = new Map(), objects = new Map(), emails = [];
  const database = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          if (sql.startsWith('SELECT COUNT')) return {count: [...rows.values()].filter(r => r.ip_hash === args[0] && r.created_at > args[1]).length};
          if (sql.startsWith('SELECT *')) return rows.get(args[0]) ?? null;
          throw new Error(`unexpected first: ${sql}`);
        },
        async run() {
          if (sql.startsWith('DELETE')) return {meta: {changes: 0}};
          if (sql.startsWith('INSERT')) {
            rows.set(args[0], {id: args[0], poll_hash: args[1], approval_hash: args[2], state: 'pending', created_at: args[3], request_expires: args[4], ip_hash: args[5], notified: 0});
            return {meta: {changes: 1}};
          }
          const r = rows.get(sql.includes('SET notified') ? args[0] : sql.includes('SET upload_hash') ? args[1] : sql.includes('SET scope') ? args[3] : args[5]);
          if (sql.includes('SET scope')) {
            if (r.state !== 'pending' || r.request_expires < args[4]) return {meta: {changes: 0}};
            Object.assign(r, {scope: args[0], state: 'approved', upload_hash: args[1], upload_expires: args[2], approval_hash: ''});
          } else if (sql.includes('SET upload_hash')) r.upload_hash = args[0];
          else if (sql.includes('SET state =')) {
            if (r.state !== 'approved') return {meta: {changes: 0}};
            Object.assign(r, {state: 'uploaded', download_hash: args[0], uploaded_at: args[1], object_key: args[2], byte_length: args[3], sha256: args[4]});
          } else if (sql.includes('SET notified')) { r.notified = 1; r.upload_hash = ''; }
          else throw new Error(`unexpected run: ${sql}`);
          return {meta: {changes: 1}};
        },
      };
    },
  };
  const bucket = {
    async put(key, body) { objects.set(key, body); },
    async get(key) { const body = objects.get(key); return body ? {body} : null; },
    async delete(key) { objects.delete(key); },
  };
  const email = {async fetch(_, options) { emails.push(JSON.parse(options.body)); return Response.json({sent: true}); }};
  return {rows, objects, emails, env: {FIRMWARE_VERIFICATIONS: database, FLASH_REPORTS_BUCKET: bucket,
    FIRMWARE_EMAIL_SERVICE: email, FLASH_REPORT_SECRET: 'test-secret-is-more-than-thirty-two-bytes'}};
}

test('browser scope approval, one-use upload and private 90-day download', async () => {
  const {env, rows, objects, emails} = fixture();
  const now = 1_790_000_000_000, base = 'https://freemkv.org';
  const created = await createRequest({request: new Request(`${base}/api/flash-reports/requests`, {method: 'POST', headers: {'CF-Connecting-IP': '192.0.2.1'}}), env}, now);
  assert.equal(created.status, 200);
  const {id, poll_token, approval_url} = await created.json();
  const approval = new URL(approval_url).searchParams.get('token');
  const poll = () => pollRequest({request: new Request(`${base}/api/flash-reports/requests/${id}/poll`, {headers: {Authorization: `Bearer ${poll_token}`}}), env, params: {id}}, now + 100);
  assert.equal((await poll()).status, 202);
  const approve = token => approveRequest({request: new Request(`${base}/api/flash-reports/requests/${id}/approve`, {
    method: 'POST', headers: {Origin: base, 'Content-Type': 'application/json'}, body: JSON.stringify({token, scope: 'session'}),
  }), env, params: {id}}, now + 100);
  assert.equal((await approve('0'.repeat(64))).status, 403);
  assert.equal((await approve(approval)).status, 200);
  assert.equal((await approve(approval)).status, 403);
  const {scope, upload_token} = await (await poll()).json();
  assert.equal(scope, 'session');
  assert.equal((await (await poll()).json()).upload_token, upload_token);
  const zip = new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]);
  const sha = Buffer.from(await crypto.subtle.digest('SHA-256', zip)).toString('hex');
  const upload = new Request(`${base}/api/flash-reports/requests/${id}/bundle`, {method: 'PUT',
    headers: {Authorization: `Bearer ${upload_token}`, 'Content-Type': 'application/zip',
      'Content-Length': String(zip.length), 'X-Content-SHA256': sha}, body: zip});
  const receipt = await uploadBundle({request: upload, env, params: {id}}, now + 200);
  assert.equal(receipt.status, 200, await receipt.text());
  assert.equal(emails.length, 1);
  assert.equal(rows.get(id).notified, 1);
  assert.equal(objects.size, 1);
  const link = emails[0].url;
  const downloaded = await downloadBundle({request: new Request(link), env, params: {id}}, now + 300);
  assert.equal(downloaded.status, 200);
  assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), zip);
  const expired = await downloadBundle({request: new Request(link), env, params: {id}}, now + 91 * 24 * 60 * 60 * 1000);
  assert.equal(expired.status, 410);
  assert.equal(objects.size, 0);
});
