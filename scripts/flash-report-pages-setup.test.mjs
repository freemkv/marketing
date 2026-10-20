import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionReportPages} from './flash-report-pages-setup.mjs';

function cloud(ready = false, bucketExists = true) {
  const calls = [];
  const project = {deployment_configs: Object.fromEntries(['preview', 'production'].map(environment => [environment, {
    d1_databases: {FIRMWARE_VERIFICATIONS: {id: `${environment}-db`}},
    services: {FIRMWARE_EMAIL_SERVICE: {service: 'freemkv-verification-email'}},
    r2_buckets: {FIRMWARE_BUCKET: {name: 'freemkv-firmware'},
      ...(ready ? {FLASH_REPORTS_BUCKET: {name: 'freemkv-flash-reports'}} : {})},
    env_vars: {FIRMWARE_VERIFICATION_SECRET: {type: 'secret_text'},
      ...(ready ? {FLASH_REPORT_SECRET: {type: 'secret_text'}} : {})},
  }]))};
  const fetcher = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer setup-token');
    if (url.endsWith('/accounts/acct/r2/buckets/freemkv-flash-reports')) {
      calls.push({method: 'GET bucket'});
      return Response.json({success: bucketExists, result: bucketExists ? {name: 'freemkv-flash-reports'} : null},
        {status: bucketExists ? 200 : 404});
    }
    assert.ok(url.endsWith('/accounts/acct/pages/projects/freemkv'));
    calls.push({method: options.method, body: options.body && JSON.parse(options.body)});
    return Response.json({success: true, result: project});
  };
  return {calls, fetcher};
}

test('dry run inspects without writing or printing secrets', async () => {
  const f = cloud();
  const report = await provisionReportPages({token: 'setup-token', accountId: 'acct', fetcher: f.fetcher});
  assert.deepEqual(f.calls.map(c => c.method), ['GET', 'GET bucket']);
  assert.ok(report.environments.every(e => !e.bucketBound && !e.secretConfigured));
  assert.ok(!JSON.stringify(report).includes('setup-token'));
});

test('apply preserves other R2 bindings and creates separate secret values', async () => {
  const f = cloud();
  await provisionReportPages({token: 'setup-token', accountId: 'acct', apply: true, fetcher: f.fetcher});
  assert.deepEqual(f.calls.map(c => c.method), ['GET', 'GET bucket', 'PATCH']);
  const configs = f.calls[2].body.deployment_configs;
  for (const config of Object.values(configs)) {
    assert.equal(config.r2_buckets.FIRMWARE_BUCKET.name, 'freemkv-firmware');
    assert.equal(config.r2_buckets.FLASH_REPORTS_BUCKET.name, 'freemkv-flash-reports');
    assert.match(config.env_vars.FLASH_REPORT_SECRET.value, /^[0-9a-f]{64}$/);
    assert.ok(!config.env_vars.FIRMWARE_VERIFICATION_SECRET);
  }
  assert.notEqual(configs.preview.env_vars.FLASH_REPORT_SECRET.value,
    configs.production.env_vars.FLASH_REPORT_SECRET.value);
});

test('repeated apply does not rotate the secret', async () => {
  const f = cloud(true);
  const report = await provisionReportPages({token: 'setup-token', accountId: 'acct', apply: true, fetcher: f.fetcher});
  assert.ok(report.environments.every(e => e.bucketBound && e.secretConfigured));
  for (const config of Object.values(f.calls[2].body.deployment_configs)) {
    assert.deepEqual(config.env_vars, {});
  }
});

test('missing private email binding and wrong bucket fail before PATCH', async () => {
  const f = cloud(true);
  const wrongEmail = async (url, options) => {
    const response = await f.fetcher(url, options);
    if (!url.endsWith('/pages/projects/freemkv')) return response;
    const data = await response.json();
    delete data.result.deployment_configs.preview.services.FIRMWARE_EMAIL_SERVICE;
    return Response.json(data);
  };
  await assert.rejects(provisionReportPages({token: 'setup-token', accountId: 'acct', apply: true,
    fetcher: wrongEmail}), /private email/);
  assert.deepEqual(f.calls.map(c => c.method), ['GET', 'GET bucket']);
  const g = cloud(true);
  const wrongBucket = async (url, options) => {
    const response = await g.fetcher(url, options);
    if (!url.endsWith('/pages/projects/freemkv')) return response;
    const data = await response.json();
    data.result.deployment_configs.production.r2_buckets.FLASH_REPORTS_BUCKET.name = 'unrelated';
    return Response.json(data);
  };
  await assert.rejects(provisionReportPages({token: 'setup-token', accountId: 'acct', apply: true,
    fetcher: wrongBucket}), /another bucket/);
  assert.deepEqual(g.calls.map(c => c.method), ['GET', 'GET bucket']);
});

test('missing R2 bucket is reported in dry run and stops apply before Pages changes', async () => {
  const f = cloud(false, false);
  const report = await provisionReportPages({token: 'setup-token', accountId: 'acct', fetcher: f.fetcher});
  assert.equal(report.bucketExists, false);
  await assert.rejects(provisionReportPages({token: 'setup-token', accountId: 'acct', apply: true,
    fetcher: f.fetcher}), /Create private R2 bucket/);
  assert.ok(f.calls.every(call => call.method !== 'PATCH'));
});

test('bucket permission errors stop setup instead of being mistaken for a missing bucket', async () => {
  const f = cloud();
  const fetcher = (url, options) => url.includes('/r2/buckets/')
    ? Response.json({success: false, errors: [{code: 10000}]}, {status: 403})
    : f.fetcher(url, options);
  await assert.rejects(provisionReportPages({token: 'setup-token', accountId: 'acct',
    apply: true, fetcher}), /bucket inspection failed/);
  assert.deepEqual(f.calls.map(call => call.method), ['GET']);
});
