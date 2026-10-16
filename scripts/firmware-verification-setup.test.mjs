import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionVerification} from './firmware-verification-setup.mjs';

function cloud(existing = false) {
  const calls = [];
  const project = {deployment_configs: Object.fromEntries(['preview', 'production'].map(environment => [environment, {
    d1_databases: {UNRELATED: {id: 'leave-this-alone'}},
    env_vars: {FIRMWARE_TURNSTILE_SECRET: {type: 'secret_text'},
      ...(existing ? {FIRMWARE_VERIFICATION_SECRET: {type: 'secret_text'}, FIRMWARE_EMAIL_ACCOUNT_ID: {type: 'secret_text'}, FIRMWARE_EMAIL_TOKEN: {type: 'secret_text'}} : {})},
  }]))};
  const databases = existing ? [{name: 'freemkv-firmware-verifications', uuid: 'prod'}, {name: 'freemkv-firmware-verifications-preview', uuid: 'preview'}] : [];
  const fetcher = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer admin-test-token');
    const path = new URL(url).pathname.replace('/client/v4', ''), body = options.body && JSON.parse(options.body);
    calls.push({path, method: options.method, body});
    let result;
    if (path.endsWith('/pages/projects/freemkv') && options.method === 'GET') result = project;
    else if (path.endsWith('/d1/database') && options.method === 'GET') result = databases;
    else if (path.endsWith('/d1/database') && options.method === 'POST') result = {name: body.name, uuid: body.name.endsWith('-preview') ? 'preview' : 'prod'};
    else if (path.endsWith('/query')) result = [{success: true}];
    else if (path.endsWith('/pages/projects/freemkv') && options.method === 'PATCH') result = project;
    else throw new Error(`Unexpected Cloudflare request ${path}`);
    return Response.json({success: true, result});
  };
  return {calls, fetcher};
}

test('setup check is read-only and reports missing email setup without exposing credentials', async () => {
  const f = cloud();
  const report = await provisionVerification({token: 'admin-test-token', accountId: 'acct', fetcher: f.fetcher});
  assert.ok(f.calls.every(c => c.method === 'GET'));
  assert.ok(report.environments.every(e => !e.databaseExists && !e.emailTokenConfigured && e.turnstileConfigured));
  assert.ok(!JSON.stringify(report).includes('admin-test-token'));
});

test('provision creates isolated databases and preserves unrelated bindings; secrets do not enter reports', async () => {
  const f = cloud();
  const report = await provisionVerification({token: 'admin-test-token', accountId: 'acct', emailToken: 'durable-email-token', apply: true, fetcher: f.fetcher});
  assert.equal(f.calls.filter(c => c.path.endsWith('/d1/database') && c.method === 'POST').length, 2);
  assert.equal(f.calls.filter(c => c.path.endsWith('/query')).length, 2);
  const config = f.calls.find(c => c.method === 'PATCH').body.deployment_configs;
  assert.equal(config.preview.d1_databases.FIRMWARE_VERIFICATIONS.id, 'preview');
  assert.equal(config.production.d1_databases.FIRMWARE_VERIFICATIONS.id, 'prod');
  for (const environment of Object.values(config)) {
    assert.equal(environment.d1_databases.UNRELATED.id, 'leave-this-alone');
    assert.equal(environment.env_vars.FIRMWARE_EMAIL_TOKEN.value, 'durable-email-token');
    assert.match(environment.env_vars.FIRMWARE_VERIFICATION_SECRET.value, /^[a-f0-9]{64}$/);
    assert.ok(!environment.env_vars.FIRMWARE_TURNSTILE_SECRET, 'existing secret is not resubmitted or overwritten');
  }
  assert.notEqual(config.preview.env_vars.FIRMWARE_VERIFICATION_SECRET.value, config.production.env_vars.FIRMWARE_VERIFICATION_SECRET.value);
  assert.ok(!JSON.stringify(report).includes('durable-email-token'));
});

test('repeated setup does not recreate databases or rotate the identity/session secret', async () => {
  const f = cloud(true);
  await provisionVerification({token: 'admin-test-token', accountId: 'acct', apply: true, fetcher: f.fetcher});
  assert.equal(f.calls.filter(c => c.path.endsWith('/d1/database') && c.method === 'POST').length, 0);
  const config = f.calls.find(c => c.method === 'PATCH').body.deployment_configs;
  assert.deepEqual(config.preview.env_vars, {});
  assert.deepEqual(config.production.env_vars, {});
});
