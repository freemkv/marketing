import test from 'node:test';
import assert from 'node:assert/strict';
import {provisionEmail} from './firmware-email-setup.mjs';

test('private email worker deployment uploads its report metadata module dependency', async () => {
  const configs = Object.fromEntries(['preview', 'production'].map(environment => [environment, {
    d1_databases: {}, services: {}, env_vars: {},
  }]));
  const project = {deployment_configs: configs};
  const databases = [
    {name: 'freemkv-firmware-verifications', uuid: 'production-db'},
    {name: 'freemkv-firmware-verifications-preview', uuid: 'preview-db'},
  ];
  let uploaded;
  const fetcher = async (url, options) => {
    const target = new URL(url), path = target.pathname.replace('/client/v4', '') + target.search;
    if (path === '/zones?name=freemkv.org') return Response.json({success: true, result: [{id: 'zone', account: {id: 'account'}}]});
    if (path === '/zones/zone/email/sending/subdomains') return Response.json({success: true, result: [{name: 'freemkv.org', enabled: true}]});
    if (path === '/accounts/account/workers/scripts/freemkv-verification-email' && options.method === 'PUT') {
      assert.ok(options.body instanceof FormData);
      uploaded = options.body;
      return Response.json({success: true, result: {}});
    }
    if (path === '/accounts/account/workers/scripts/freemkv-verification-email/subdomain') return Response.json({success: true, result: {}});
    if (path === '/accounts/account/pages/projects/freemkv' && options.method === 'GET') return Response.json({success: true, result: project});
    if (path === '/accounts/account/d1/database?per_page=100') return Response.json({success: true, result: databases});
    if (path.startsWith('/accounts/account/d1/database/') && path.endsWith('/query')) return Response.json({success: true, result: [{success: true}]});
    if (path === '/accounts/account/pages/projects/freemkv' && options.method === 'PATCH') return Response.json({success: true, result: project});
    throw new Error(`Unexpected Cloudflare request ${options.method} ${path}`);
  };

  const result = await provisionEmail({token: 'worker-test-token', apply: true, fetcher});
  assert.equal(result.applied, true);
  assert.ok(uploaded);
  const metadata = JSON.parse(await uploaded.get('metadata').text());
  assert.equal(metadata.main_module, 'firmware-email.mjs');
  const main = await uploaded.get('firmware-email.mjs').text();
  const dependency = await uploaded.get('src/lib/firmware-report-inputs.mjs').text();
  assert.match(main, /\.\.\/src\/lib\/firmware-report-inputs\.mjs/);
  assert.match(dependency, /export function firmwareInputText/);
});
