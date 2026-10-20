// Read-only unless --apply. Binds the private report bucket and adds a Pages
// HMAC secret without replacing existing bindings or rotating an existing key.
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {localToken} from './firmware-verification-setup.mjs';

const bucket = 'freemkv-flash-reports';

export async function provisionReportPages({token, accountId, apply = false, fetcher = fetch}) {
  if (!token || !accountId) throw new Error('Cloudflare token and account ID are required.');
  const base = `/accounts/${accountId}/pages/projects/freemkv`;
  async function api(method, body) {
    const response = await fetcher(`https://api.cloudflare.com/client/v4${base}`, {
      method,
      headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      ...(body ? {body: JSON.stringify(body)} : {}),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(`Cloudflare Pages ${method} failed (${response.status}).`);
    return data.result;
  }
  const project = await api('GET');
  const bucketResponse = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}`, {
    method: 'GET', headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(30000),
  });
  const bucketData = await bucketResponse.json();
  if (bucketResponse.status !== 404 && (!bucketResponse.ok || !bucketData.success)) {
    throw new Error(`R2 bucket inspection failed (${bucketResponse.status}).`);
  }
  const bucketExists = bucketResponse.ok && bucketData.success && bucketData.result?.name === bucket;
  if (apply && !bucketExists) throw new Error(`Create private R2 bucket ${bucket} before binding Pages.`);
  const report = [], deployment_configs = {};
  for (const environment of ['preview', 'production']) {
    const existing = project.deployment_configs?.[environment];
    if (!existing?.d1_databases?.FIRMWARE_VERIFICATIONS?.id ||
        !existing?.services?.FIRMWARE_EMAIL_SERVICE?.service) {
      throw new Error(`${environment} needs its existing D1 and private email service bindings first.`);
    }
    const currentBucket = existing.r2_buckets?.FLASH_REPORTS_BUCKET?.name;
    if (currentBucket && currentBucket !== bucket) {
      throw new Error(`${environment} FLASH_REPORTS_BUCKET points to another bucket.`);
    }
    const secretExists = Boolean(existing.env_vars?.FLASH_REPORT_SECRET);
    report.push({environment, bucketBound: currentBucket === bucket, secretConfigured: secretExists});
    if (apply) deployment_configs[environment] = {
      r2_buckets: {...existing.r2_buckets, FLASH_REPORTS_BUCKET: {name: bucket}},
      env_vars: secretExists ? {} : {
        FLASH_REPORT_SECRET: {type: 'secret_text', value: randomBytes(32).toString('hex')},
      },
      wrangler_config_hash: existing.wrangler_config_hash,
    };
  }
  if (apply) await api('PATCH', {deployment_configs});
  return {applied: apply, bucketExists, environments: report};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await provisionReportPages({
      token: await localToken(),
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apply: process.argv.includes('--apply'),
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
