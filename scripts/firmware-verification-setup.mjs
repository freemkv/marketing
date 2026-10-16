// Idempotent D1 + Pages setup. Run without --apply to inspect only.
// Uses CLOUDFLARE_API_TOKEN/ACCOUNT_ID or the existing local Wrangler login.
// FIRMWARE_EMAIL_TOKEN must be a durable Email Sending:Edit token, never an
// expiring Wrangler OAuth token. No credential values are printed or saved.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';

export async function provisionVerification({token, accountId, emailToken, apply = false, fetcher = fetch}) {
  if (!token) throw new Error('Cloudflare authentication is required.');
  async function api(path, method = 'GET', body, optional = false) {
    const response = await fetcher(`https://api.cloudflare.com/client/v4${path}`, {method,
      headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(30000)});
    const data = await response.json();
    if (!response.ok || !data.success) {
      if (optional && [403, 404].includes(response.status)) return null;
      throw new Error(`Cloudflare ${method} ${path.replace(/\/accounts\/[^/]+/, '/accounts/<account>')} failed (${response.status}; codes ${(data.errors || []).map(e => e.code).join(',')}).`);
    }
    return data.result;
  }
  const accounts = accountId ? [{id: accountId}] : await api('/accounts?per_page=50');
  const found = [];
  for (const account of accounts) {
    const project = await api(`/accounts/${account.id}/pages/projects/freemkv`, 'GET', undefined, true);
    if (project) found.push({account, project});
  }
  if (found.length !== 1) throw new Error('Expected exactly one accessible freemkv Pages project. Set CLOUDFLARE_ACCOUNT_ID explicitly.');
  const {account, project} = found[0], base = `/accounts/${account.id}`;
  const schema = await readFile(new URL('../migrations/0001_firmware_verification.sql', import.meta.url), 'utf8');
  const databases = await api(`${base}/d1/database?per_page=100`);
  const report = [], configs = {};
  for (const environment of ['preview', 'production']) {
    const name = `freemkv-firmware-verifications${environment === 'preview' ? '-preview' : ''}`;
    const existing = project.deployment_configs?.[environment] || {};
    let database = databases.find(d => d.name === name);
    if (!database && apply) database = await api(`${base}/d1/database`, 'POST', {name});
    if (database && apply) {
      const results = await api(`${base}/d1/database/${database.uuid}/query`, 'POST', {sql: schema});
      if (results.some(r => r.success === false)) throw new Error(`Schema migration failed for ${environment}.`);
    }
    const vars = {}, current = existing.env_vars || {};
    if (!current.FIRMWARE_VERIFICATION_SECRET) vars.FIRMWARE_VERIFICATION_SECRET = {type: 'secret_text', value: randomBytes(32).toString('hex')};
    if (!current.FIRMWARE_EMAIL_ACCOUNT_ID) vars.FIRMWARE_EMAIL_ACCOUNT_ID = {type: 'secret_text', value: account.id};
    if (emailToken) vars.FIRMWARE_EMAIL_TOKEN = {type: 'secret_text', value: emailToken};
    if (apply) configs[environment] = {
      d1_databases: {...existing.d1_databases, FIRMWARE_VERIFICATIONS: {id: database.uuid}},
      env_vars: vars, wrangler_config_hash: existing.wrangler_config_hash,
    };
    report.push({environment, database: name, databaseExists: Boolean(database),
      emailTokenConfigured: Boolean(emailToken || current.FIRMWARE_EMAIL_TOKEN),
      turnstileConfigured: Boolean(current.FIRMWARE_TURNSTILE_SECRET),
      sender: 'noreply@freemkv.org'});
  }
  if (apply) await api(`${base}/pages/projects/freemkv`, 'PATCH', {deployment_configs: configs});
  return {applied: apply, environments: report};
}

async function localToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  for (const path of ['Library/Preferences/.wrangler/config/default.toml', '.wrangler/config/default.toml', '.config/.wrangler/config/default.toml']) {
    try {
      const content = await readFile(resolve(homedir(), path), 'utf8');
      const value = content.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
      if (value) return value;
    } catch { /* try the next standard Wrangler location */ }
  }
  return undefined;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await provisionVerification({token: await localToken(), accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      emailToken: process.env.FIRMWARE_EMAIL_TOKEN, apply: process.argv.includes('--apply')});
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
