// Read-only unless --apply. Uses the Wrangler login only during provisioning;
// runtime delivery uses a private native binding, with no stored API token.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {localToken, provisionVerification} from './firmware-verification-setup.mjs';
const service = 'freemkv-verification-email';
export async function provisionEmail({token, apply = false, fetcher = fetch}) {
  if (!token) throw new Error('Cloudflare authentication is required.');
  async function api(path, method = 'GET', body) {
    const form = body instanceof FormData;
    const response = await fetcher(`https://api.cloudflare.com/client/v4${path}`, {method,
      headers: {Authorization: `Bearer ${token}`, ...(!form ? {'Content-Type': 'application/json'} : {})},
      ...(body ? {body: form ? body : JSON.stringify(body)} : {}), signal: AbortSignal.timeout(30000)});
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(`Cloudflare email setup failed (${response.status}; codes ${(data.errors || []).map(e => e.code).join(',')}).`);
    return data.result;
  }
  const zones = await api('/zones?name=freemkv.org');
  if (zones.length !== 1) throw new Error('Expected exactly one freemkv.org zone.');
  const zone = zones[0], base = `/accounts/${zone.account.id}`;
  const domains = await api(`/zones/${zone.id}/email/sending/subdomains`);
  let domain = domains.find(d => d.name === 'freemkv.org' && d.enabled);
  if (!domain && apply) domain = await api(`/zones/${zone.id}/email/sending/subdomains`, 'POST', {name: 'freemkv.org'});
  if (apply) {
    const body = new FormData();
    body.set('metadata', new Blob([JSON.stringify({main_module: 'firmware-email.mjs', compatibility_date: '2026-10-16',
      bindings: [{name: 'EMAIL', type: 'send_email', allowed_sender_addresses: ['noreply@freemkv.org']}],
      observability: {enabled: false}})], {type: 'application/json'}));
    body.set('firmware-email.mjs', new Blob([await readFile(new URL('../workers/firmware-email.mjs', import.meta.url), 'utf8')],
      {type: 'application/javascript+module'}), 'firmware-email.mjs');
    await api(`${base}/workers/scripts/${service}`, 'PUT', body);
    await api(`${base}/workers/scripts/${service}/subdomain`, 'POST', {enabled: false, previews_enabled: false});
  }
  const setup = await provisionVerification({token, accountId: zone.account.id, apply, ...(apply ? {emailService: service} : {}), fetcher});
  return {applied: apply, sendingDomainEnabled: Boolean(domain), sender: 'noreply@freemkv.org',
    ...setup, service: apply ? service : undefined};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await provisionEmail({token: await localToken(), apply: process.argv.includes('--apply')}), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
