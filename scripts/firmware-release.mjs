import { validateCapabilityCoverage } from '../src/lib/firmware-capabilities.mjs';
import { validateOriginDetails } from '../src/lib/firmware-origin.mjs';
// Prepare locally; publish only in an explicitly requested release workflow.
import { createHash } from 'node:crypto';
import { promises as fs, createReadStream, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createGunzip } from 'node:zlib';
import { firmwareObjectFetcher } from './firmware-object-fetch.mjs';
import { LATEST_ARCHIVE_KEY } from '../src/lib/firmware-archive.mjs';
import { crossflashGraph, seedCrossflashCache } from './firmware-crossflash-cache.mjs';
import { validateCrossflashCoverage } from '../src/lib/finder.mjs';

const PUBLIC_BASE = 'https://pub-10fe57a98db44568abcfb5db130d3b3f.r2.dev';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = b => createHash('sha256').update(b).digest('hex');
const json = async p => JSON.parse(await fs.readFile(p, 'utf8'));
export function safePath(p) {
  return typeof p === 'string' && /^[A-Za-z0-9._%/-]+$/.test(p) && !p.startsWith('/') && p.split('/').every(x => x && x !== '.' && x !== '..');
}
function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (r.error || r.status !== 0) throw new Error(`${cmd} failed: ${r.error ?? r.status}`);
}
const V1 = 'freemkv-firmware-publish-v1', V2 = 'freemkv-firmware-publish-v2';
const FAMILIES = ['pioneer', 'mediatek', 'renesas', 'unknown'];
const CONTENT_TYPES = { tar: 'application/x-tar', bin: 'application/octet-stream' };
// v2 keys are content-addressed: fw/<family>/<sha256>.<tar|bin>, one object per package.
export const V2_KEY = /^fw\/([a-z]+)\/([a-f0-9]{64})\.(tar|bin)$/;
export function safeFilename(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/.test(name) && !name.includes('..');
}
function v1Object(o) {
  return safePath(o.key) && ((o.key.startsWith('pioneer/') && o.key.endsWith('.tar')) || /^(MT1939|MT1959)\/[A-Za-z0-9._%-]+\.bin$/.test(o.key));
}
function v2Object(o) {
  const m = typeof o.key === 'string' && o.key.match(V2_KEY);
  return Boolean(m) && FAMILIES.includes(m[1]) && m[2] === o.sha256 && safeFilename(o.filename) &&
    (o.content_type === undefined || o.content_type === CONTENT_TYPES[m[3]]) && (o.family === undefined || o.family === m[1]);
}
export function validateManifest(m) {
  if (![V1, V2].includes(m?.format) || !Array.isArray(m.objects) || !m.objects.length) throw new Error('Invalid publish manifest');
  const seen = new Set(), shas = new Set();
  for (const o of m.objects) {
    if (!(m.format === V1 ? v1Object(o) : v2Object(o)) || !/^[a-f0-9]{64}$/.test(o.sha256) || !Number.isSafeInteger(o.bytes) || o.bytes <= 0 || o.bytes > 64*1024*1024 || seen.has(o.key)) throw new Error('Invalid or duplicate object');
    if (m.format === V2 && shas.has(o.sha256)) throw new Error('Invalid or duplicate object');
    seen.add(o.key); shas.add(o.sha256);
  }
  return m;
}
export const contentType = key => key.endsWith('.tar') ? CONTENT_TYPES.tar : CONTENT_TYPES.bin;
// Every package listed in a v2 finder catalogue, with its revision context.
export function catalogPackages(catalog) {
  if (catalog?.format !== 'freemkv-finder-catalog' || catalog.version !== 2 || !Array.isArray(catalog.identities)) throw new Error('Invalid finder catalog');
  return catalog.identities.flatMap(i => (i.revisions ?? []).flatMap(r => r.packages ?? []));
}
export function rejectWithdrawn(catalog, withdrawals) {
  const rejected = new Set(withdrawals.map(row => row.normalSha256 ?? row.imageSha256));
  const versions = Array.isArray(catalog)
    ? catalog.flatMap(model => (model.versions ?? []).flatMap(v => [v.normalSha256, v.sha256]))
    : catalogPackages(catalog).flatMap(p => [p.normal_sha256, p.image_sha256, p.sha256]);
  if (versions.some(sha => sha && rejected.has(sha))) throw new Error('Catalog contains withdrawn firmware');
}
export function validateWithdrawal(row) {
  const pioneer = row?.normalSha256 && (row.key?.startsWith('pioneer/') || /^fw\/pioneer\/[a-f0-9]{64}\.tar$/.test(row.key)) && row.key.endsWith('.tar');
  const mediatek = row?.imageSha256 && (/^(MT1939|MT1959)\/[A-Za-z0-9._%-]+\.bin$/.test(row.key) || /^fw\/mediatek\/[a-f0-9]{64}\.tar$/.test(row.key));
  if (!safePath(row?.key) || !(pioneer || mediatek) || !/^[a-f0-9]{64}$/.test(row.normalSha256 ?? row.imageSha256)) throw new Error('Invalid withdrawal receipt');
  return row;
}
async function checkWithdrawals(catalog) {
  rejectWithdrawn(catalog, await json(path.join(SITE,'scripts/firmware-withdrawals.json')));
}
/**
 * Cross-check a v2 stage before any external write: every catalogue package is
 * exactly one manifest object (key, sha, size, filename), every object is used,
 * no withdrawn Normal hash is listed, and every legacy key resolves to a
 * published object with the same bytes (or is explicitly left on its old key).
 */
export function checkStageV2(manifest, catalog, legacy) {
  const objects = new Map(manifest.objects.map(o => [o.key, o]));
  const used = new Set();
  for (const p of catalogPackages(catalog)) {
    const o = objects.get(p.key);
    if (!o || o.sha256 !== p.sha256 || o.bytes !== p.bytes || o.filename !== p.filename) throw new Error('Catalog/object mismatch');
    used.add(p.key);
  }
  if (used.size !== objects.size) throw new Error('Unreferenced object');
  if (legacy?.format !== 'freemkv-firmware-legacy-keys' || !Array.isArray(legacy.keys)) throw new Error('Invalid legacy keys');
  for (const row of legacy.keys) {
    if (!safePath(row.key) || !/^[a-f0-9]{64}$/.test(row.sha256)) throw new Error('Invalid legacy key');
    if (row.new_key == null) { if (!['missing-bytes', 'missing-package'].includes(row.status)) throw new Error('Unresolved legacy key'); continue; }
    const o = objects.get(row.new_key);
    if (!o || o.sha256 !== row.sha256) throw new Error(`Legacy key does not resolve: ${row.key}`);
  }
}
// The crossflash links come from freemkv-flash itself (its `freemkv-crossflash`
// binary runs the flasher's own gates over the staged payloads), so the finder
// never re-implements the crossflash rule.
export function crossflashCommand(env = process.env) {
  if (!env.FREEMKV_CROSSFLASH) throw new Error('Set FREEMKV_CROSSFLASH to the freemkv-crossflash binary (cargo build --release -p freemkv-flash --bin freemkv-crossflash in freemkv-firmware)');
  return env.FREEMKV_CROSSFLASH;
}
export function fwextCommand(extractor, env = process.env) {
  return env.FWEXT ? [env.FWEXT, []] : ['cargo', ['run', '--quiet', '--release', '--bin', 'fwext', '--']];
}
// v2: `fwext publish-catalog` validates every package and writes the stage
// (finder-catalog.json, publish-manifest.json v2, legacy-keys.json, payloads/fw/...).
export async function prepare(extractor, destination, hoard, { fullUpload = false } = {}) {
  if (!process.env.FREEMKV_FW) throw new Error('Set FREEMKV_FW to the Modify capability producer');
  extractor = path.resolve(extractor); destination = path.resolve(destination);
  hoard = path.resolve(hoard ?? path.join(extractor, 'hoard'));
  try { await fs.access(destination); throw new Error(`${destination} already exists`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const [cmd, prefix] = fwextCommand(extractor);
  run(cmd, [...prefix, 'publish-catalog', '--hoard', hoard, '--out', destination,
    '--flasher', crossflashCommand(),
    '--legacy-pioneer', path.join(SITE, 'src/data/pioneer-firmware-index.json'),
    '--withdrawals', path.join(SITE, 'scripts/firmware-withdrawals.json')], { cwd: extractor });
  const manifest = validateManifest(await json(path.join(destination, 'publish-manifest.json')));
  if (manifest.format !== V2) throw new Error('fwext produced an unexpected manifest format');
  const catalog = await json(path.join(destination, 'finder-catalog.json'));
  validateOriginDetails(catalog);
  await checkWithdrawals(catalog);
  checkStageV2(manifest, catalog, await json(path.join(destination, 'legacy-keys.json')));
  for (const o of manifest.objects) {
    const raw = await fs.readFile(path.join(destination, 'payloads', o.key));
    if (raw.length !== o.bytes || hash(raw) !== o.sha256) throw new Error('Payload hash/size mismatch');
  }
  const { graph } = await crossflashGraph({ engine: crossflashCommand(), root: path.join(destination, 'payloads'), objects: manifest.objects,
    cacheFile: process.env.FIRMWARE_CROSSFLASH_CACHE ?? path.join(hoard, 'cache', 'website-crossflash.json') });
  checkCrossflashLinks(graph, catalog);
  await fs.writeFile(path.join(destination, 'crossflash-links.json'), JSON.stringify(graph, null, 2));
  run(process.execPath, [path.join(SITE, 'scripts/firmware-features.mjs'), hoard,
    '--fw', process.env.FREEMKV_FW, '--flash', crossflashCommand(),
    '--eligible-catalog', path.join(destination, 'finder-catalog.json'), '--out-dir', destination], { cwd: SITE });
  await checkStageCapabilities(destination, catalog);
  const baseline = fullUpload ? { format: 'freemkv-finder-catalog', version: 2, identities: [] } : await json(path.join(SITE, 'src/data/finder-catalog.json'));
  await transportArchive(destination, `${destination}.tar.gz`, baseline);
}
// The transport carries the full desired inventory but only changed payloads.
// CI retrieves every omitted object from the fixed bucket and verifies its bytes
// before deploying, then builds the complete latest archive there.
export async function transportArchive(directory, archive, baseline) {
  const manifest = validateManifest(await json(path.join(directory, 'publish-manifest.json')));
  if (manifest.format !== V2) throw new Error('Delta transport requires v2');
  const previous = new Map(catalogPackages(baseline).map(o => [o.key, o]));
  const included = manifest.objects.filter(o => {
    const old = previous.get(o.key);
    return !old || old.sha256 !== o.sha256 || old.bytes !== o.bytes;
  }).map(o => o.key).sort();
  await fs.writeFile(path.join(directory, 'transport.json'), JSON.stringify({ format: 'freemkv-firmware-delta-v1', included }));
  run('tar', ['--format=ustar', '-czf', archive, '-C', directory, ...V2_MEMBERS, 'transport.json', ...included.map(key => `payloads/${key}`)], {env:{...process.env,COPYFILE_DISABLE:'1'}});
  console.log(`Prepared ${included.length} changed payloads (${manifest.objects.length} total): ${archive}`);
  return included;
}
export async function fullArchive(directory, archive) {
  const manifest = validateManifest(await json(path.join(directory, 'publish-manifest.json')));
  for (const o of manifest.objects) {
    const raw = await fs.readFile(path.join(directory, 'payloads', o.key));
    if (raw.length !== o.bytes || hash(raw) !== o.sha256) throw new Error('Full archive payload mismatch');
  }
  run('tar', ['--format=ustar', '-czf', archive, '-C', directory, ...(manifest.format === V2 ? V2_MEMBERS : V1_MEMBERS), ...manifest.objects.map(o => `payloads/${o.key}`)], {env:{...process.env,COPYFILE_DISABLE:'1'}});
}
/** Every crossflash link must name packages of this catalogue. */
export function checkCrossflashLinks(links, catalog) {
  const map = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (links?.format !== 'freemkv-crossflash-links' || ![1, 2].includes(links.version) || !map(links.links) || ((links.version === 2 || links.future !== undefined) && !map(links.future))) throw new Error('Invalid crossflash links');
  if (links.conditional !== undefined && !map(links.conditional)) throw new Error('Invalid conditional crossflash links');
  if (links.evaluated_packages !== undefined) validateCrossflashCoverage(catalog, links);
  const shas = new Set();
  for (const i of catalog.identities) for (const r of i.revisions ?? []) for (const p of r.packages ?? []) shas.add(p.sha256);
  for (const graph of [links.links, links.future ?? {}, links.conditional ?? {}]) {
    for (const [from, to] of Object.entries(graph)) {
      if (!Array.isArray(to) || to.some(s => typeof s !== 'string')) throw new Error('Invalid crossflash targets');
      for (const s of [from, ...to]) if (!shas.has(s)) throw new Error(`Crossflash link names a package not in the catalogue: ${s}`);
    }
  }
  const seen = new Set();
  for (const graph of [links.links, links.future ?? {}, links.conditional ?? {}]) for (const [from, targets] of Object.entries(graph)) for (const to of targets) {
    const pair = `${from}:${to}`;
    if (seen.has(pair)) throw new Error('Crossflash pair cannot be both available and future or conditional');
    seen.add(pair);
  }
}
const V1_MEMBERS = ['publish-manifest.json','pioneer-firmware-index.json','firmware-index.json'];
const CAPABILITY_FILES = ['firmware-capabilities.json', 'firmware-index.json', 'firmware-features.json', 'firmware-features-summary.md'];
const V2_MEMBERS = ['publish-manifest.json','finder-catalog.json','legacy-keys.json','crossflash-links.json', ...CAPABILITY_FILES];
export async function checkStageCapabilities(directory, catalog) {
  return validateCapabilityCoverage(catalog, await json(path.join(directory, 'firmware-capabilities.json')),
    await json(path.join(directory, 'firmware-index.json')));
}
// Strict streaming ustar extraction: no links, PAX, devices, traversal or overwrites.
export async function extract(archive, directory) {
  await fs.mkdir(directory); const seen = new Set();
  let buf = Buffer.alloc(0), remaining = 0, padding = 0, handle = null, total = 0, ended = false;
  try {
    for await (const chunk of createReadStream(archive).pipe(createGunzip())) {
      buf = Buffer.concat([buf,chunk]); total += chunk.length;
      if (total > 16*1024**3) throw new Error('Archive too large');
      while (true) {
        if (remaining) { const n = Math.min(remaining,buf.length); if (!n) break; await handle.write(buf.subarray(0,n)); buf=buf.subarray(n); remaining-=n; if (!remaining) { await handle.close(); handle=null; } continue; }
        if (padding) { if (buf.length < padding) break; buf=buf.subarray(padding); padding=0; }
        if (buf.length < 512) break;
        const h=buf.subarray(0,512); buf=buf.subarray(512);
        if (h.every(x=>x===0)) { ended=true; continue; }
        if (ended) throw new Error('Data after tar terminator');
        const str=(a,b)=>h.subarray(a,b).toString('utf8').replace(/\0.*$/s,'');
        const name=[str(345,500),str(0,100)].filter(Boolean).join('/').replace(/\/$/,'');
        const sizeText=str(124,136).trim(); const checksumText=str(148,156).trim();
        if (!/^[0-7]+$/.test(sizeText) || !/^[0-7]+$/.test(checksumText)) throw new Error('Invalid tar numeric field');
        const size=parseInt(sizeText,8), checksum=[...h].reduce((s,b,i)=>s+(i>=148&&i<156?32:b),0);
        const type=h[156];
        if (checksum!==parseInt(checksumText,8) || !safePath(name) || seen.has(name) || ![0,48,53].includes(type) || size>64*1024*1024) throw new Error('Unsafe tar member');
        if (!(name==='transport.json' || name==='payloads' || name.startsWith('payloads/pioneer/') || [...V1_MEMBERS,...V2_MEMBERS].includes(name) || name==='payloads/pioneer' || name==='payloads/MT1939' || name==='payloads/MT1959' || /^payloads\/(MT1939|MT1959)\/[A-Za-z0-9._%-]+\.bin$/.test(name) || name==='payloads/fw' || /^payloads\/fw\/[a-z]+$/.test(name) || V2_KEY.test(name.slice('payloads/'.length)))) throw new Error('Unexpected tar member');
        seen.add(name); const target=path.join(directory,name);
        if (type===53) { if(size) throw new Error('Directory data'); await fs.mkdir(target,{recursive:true}); }
        else { await fs.mkdir(path.dirname(target),{recursive:true}); handle=await fs.open(target,'wx'); remaining=size; padding=(512-size%512)%512; if(!remaining){await handle.close();handle=null;} }
      }
    }
    if (remaining || padding || !ended || buf.some(x=>x!==0)) throw new Error('Truncated tar');
  } finally { await handle?.close(); }
}
export async function publish(directory, upload, fetcher=fetch, pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  const manifest=validateManifest(await json(path.join(directory,'publish-manifest.json')));
  const objects=new Map(manifest.objects.map(o=>[o.key,o]));
  let transport;
  try { transport = await json(path.join(directory, 'transport.json')); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  if (transport && (manifest.format !== V2 || transport.format !== 'freemkv-firmware-delta-v1' || !Array.isArray(transport.included) || new Set(transport.included).size !== transport.included.length || transport.included.some(key => !objects.has(key)))) throw new Error('Invalid delta transport');
  const included = transport ? new Set(transport.included) : new Set(objects.keys());
  const verifiedReuse = new Set();
  if (manifest.format===V2) {
    const catalog=await json(path.join(directory,'finder-catalog.json'));
    await checkWithdrawals(catalog);
    checkStageV2(manifest,catalog,await json(path.join(directory,'legacy-keys.json')));
    await checkStageCapabilities(directory, catalog);
  } else {
    // v1 staged archives (pre content-addressing) remain publishable.
    const pioneer=await json(path.join(directory,'pioneer-firmware-index.json'));
    await checkWithdrawals(pioneer);
    if (!Array.isArray(pioneer) || !pioneer.length) throw new Error('Invalid staged catalogs');
    const used=new Set();
    for (const m of pioneer) {
      if (typeof m.model !== 'string' || !Array.isArray(m.versions) || !m.versions.length) throw new Error('Invalid catalog model');
      for (const v of m.versions) {
        const o=objects.get(v.file);
        if (!o || o.sha256!==v.sha256 || o.bytes!==v.bytes) throw new Error('Catalog/object mismatch');
        used.add(v.file);
      }
    }
    const mediatek=await json(path.join(directory,'firmware-index.json'));
    if (!Array.isArray(mediatek)) throw new Error('Invalid staged catalogs');
    for (const m of mediatek) for (const v of m.versions ?? []) {
      const o=objects.get(v.file);
      if (o) {
        if (o.sha256!==v.sha256 || (v.bytes != null && o.bytes!==v.bytes)) throw new Error('MediaTek catalog/object mismatch');
        used.add(v.file);
      }
    }
    if (used.size!==objects.size) throw new Error('Unreferenced object');
  }
  // Validate everything before the first external write.
  for (const o of objects.values()) {
    if (!included.has(o.key)) continue;
    const raw=await fs.readFile(path.join(directory,'payloads',o.key));
    if (raw.length!==o.bytes || hash(raw)!==o.sha256) throw new Error('Payload hash/size mismatch');
  }
  const reused = [...objects.values()].filter(o => !included.has(o.key));
  let reuseCursor = 0, reuseFailure = null;
  await Promise.all(Array.from({length:Math.min(8,reused.length)}, async () => {
    while (!reuseFailure && reuseCursor < reused.length) {
      const o = reused[reuseCursor++];
      try {
        // Omitted payloads may only come from our fixed object store. Full hash
        // verification is mandatory, including when the bucket is private.
        const response = await fetcher(`${PUBLIC_BASE}/${o.key}`, {headers:{'User-Agent':'curl/8.7.1'},signal:AbortSignal.timeout(60000)});
        if (!response.ok) { await response.body?.cancel(); throw new Error(`Reused firmware unavailable: ${o.key}`); }
        const raw = Buffer.from(await response.arrayBuffer());
        if (raw.length !== o.bytes || hash(raw) !== o.sha256) throw new Error(`Reused firmware hash/size mismatch: ${o.key}`);
        const file = path.join(directory, 'payloads', o.key);
        await fs.mkdir(path.dirname(file), {recursive:true});
        await fs.writeFile(file, raw);
        verifiedReuse.add(o.key);
        if (verifiedReuse.size % 25 === 0 || verifiedReuse.size === reused.length) console.log(`Fetched and verified ${verifiedReuse.size}/${reused.length} reused objects`);
      } catch(e) { reuseFailure ??= e; }
    }
  }));
  if (reuseFailure) throw reuseFailure;
  // Manifest keys are URL-ready paths produced by segment(). Pinned Wrangler
  // decodes their percent escapes on PUT; public URLs use them exactly once.
  async function publicMatches(o) {
    try {
      const response=await fetcher(`${PUBLIC_BASE}/${o.key}`, {headers:{'User-Agent':'curl/8.7.1'},signal:AbortSignal.timeout(60000)});
      if (!response.ok) { await response.body?.cancel(); return false; }
      const raw=Buffer.from(await response.arrayBuffer());
      return raw.length===o.bytes && hash(raw)===o.sha256;
    } catch { return false; }
  }
  const pending=[...objects.values()]; let cursor=0, completed=0, failure=null;
  async function worker() {
    while (!failure && cursor<pending.length) {
      const o=pending[cursor++];
      try {
        if (!verifiedReuse.has(o.key) && !await publicMatches(o)) {
          await upload(o,path.join(directory,'payloads',o.key));
          let verified=false;
          for (let attempt=0;attempt<4;attempt++) {
            if (attempt) await pause(1000*2**(attempt-1));
            if (await publicMatches(o)) { verified=true; break; }
          }
          if (!verified) throw new Error(`Firmware verification failed: ${o.key}`);
        }
        completed++;
        if(completed%25===0 || completed===pending.length) console.log(`Verified ${completed}/${pending.length} firmware objects`);
      } catch(e) { failure ??= e; }
    }
  }
  await Promise.all(Array.from({length:Math.min(8,pending.length)},()=>worker()));
  if(failure) throw failure;
  return manifest.objects.length;
}
/**
 * Delete every R2 object that is not in `keep`. Content-addressed keys would
 * accumulate forever otherwise, and the public bucket is only ever read by our
 * site, so superseded firmware has no reason to linger.
 */
export async function pruneOrphans(keep, { listPage, deleteKey, bucket = 'freemkv-firmware' } = {}) {
  const keepSet = new Set([...keep, LATEST_ARCHIVE_KEY]);
  let cursor; const orphans = [];
  do {
    const page = await listPage({ cursor, bucket });
    for (const o of page.objects ?? []) if (!keepSet.has(o.key)) orphans.push(o.key);
    cursor = page.truncated ? (page.cursor ?? page.next_cursor) : null;
  } while (cursor);
  for (const key of orphans) await deleteKey(key, bucket);
  return orphans;
}
function cfListPage(fetcher) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
  return async ({ cursor, bucket }) => {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${bucket}/objects`);
    url.searchParams.set('per_page', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetcher(url.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Cloudflare R2 list failed: ${response.status}`);
    const data = await response.json();
    if (!data?.success) throw new Error(`Cloudflare R2 list rejected: ${JSON.stringify(data?.errors ?? data)}`);
    const info = data.result_info ?? {};
    return { objects: data.result ?? [], truncated: Boolean(info.cursor || info.is_truncated), cursor: info.cursor };
  };
}
function wranglerDelete(bucket, key) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(SITE, 'node_modules/.bin/wrangler'),
      ['r2', 'object', 'delete', `${bucket}/${key}`, '--remote'], { stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Wrangler delete failed: ${code ?? signal}`)));
  });
}
// One local entrypoint for a candidate: ingest new inputs, stage only Flash-
// admitted packages, validate their crossflash graph, then derive modification
// claims from outputs which Flash also admits.
async function release(extractor, destination, hoard, { refresh = false, fullUpload = false } = {}) {
  if (!extractor || !destination) throw new Error('Usage: firmware-release.mjs release EXTRACTOR STAGE [V3_HOARD]');
  extractor = path.resolve(extractor);
  hoard = path.resolve(hoard ?? path.join(extractor, 'hoard'));
  if (!process.env.FREEMKV_FW) throw new Error('Set FREEMKV_FW to the freemkv-fw binary');
  crossflashCommand();
  try { await fs.access(path.resolve(destination)); throw new Error(`${destination} already exists`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const [cmd, prefix] = fwextCommand(extractor);
  run(cmd, [...prefix, refresh ? 'refresh' : 'ingest', '--hoard', hoard], { cwd: extractor });
  await prepare(extractor, destination, hoard, { fullUpload });
}
async function main() {
  const [command,a,b,c]=process.argv.slice(2);
  if(command==='release') {
    const args = process.argv.slice(3);
    const refresh = args.includes('--refresh');
    const fullUpload = args.includes('--full-upload');
    const positional = args.filter(arg => !['--refresh', '--full-upload'].includes(arg));
    if (positional.some(arg => arg.startsWith('--')) || positional.length < 2 || positional.length > 3)
      throw new Error('Usage: firmware-release.mjs release EXTRACTOR STAGE [V3_HOARD] [--refresh]');
    return release(positional[0], positional[1], positional[2], { refresh, fullUpload });
  }
  if(command==='prepare' && a && b) {
    const args = process.argv.slice(3), fullUpload = args.includes('--full-upload');
    const positional = args.filter(arg => arg !== '--full-upload');
    if (positional.some(arg => arg.startsWith('--')) || positional.length < 2 || positional.length > 3) throw new Error('Usage: firmware-release.mjs prepare EXTRACTOR STAGE [V3_HOARD] [--full-upload]');
    return prepare(positional[0],positional[1],positional[2],{fullUpload});
  }
  if(command==='seed-crossflash-cache' && a && b) {
    const manifest = validateManifest(await json(path.join(a, 'publish-manifest.json')));
    const graph = await json(path.join(a, 'crossflash-links.json'));
    checkCrossflashLinks(graph, await json(path.join(a, 'finder-catalog.json')));
    return seedCrossflashCache({ file: b, engine: crossflashCommand(), root: path.join(a, 'payloads'), objects: manifest.objects, graph });
  }
  if(command==='extract' && a && b) return extract(a,b);
  if(command==='archive' && a && b) return fullArchive(a,b);
  if(command==='publish' && a) {
    validateOriginDetails(await json(path.join(a, 'finder-catalog.json')));
    if(!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) throw new Error('Explicit Cloudflare account and token required');
    await publish(a,(o,file)=>new Promise((resolve,reject)=>{
      const child=spawn(path.join(SITE,'node_modules/.bin/wrangler'),['r2','object','put',`freemkv-firmware/${o.key}`,'--file',file,'--content-type',contentType(o.key),'--remote'],{stdio:'inherit',env:process.env});
      child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`Wrangler upload failed: ${code ?? signal}`)));
    }),firmwareObjectFetcher());
    // Prune superseded R2 objects: the public bucket is only ever read by our
    // site, so any key not in the fresh manifest is a dead content-addressed
    // copy and should be deleted.
    const manifest=await json(path.join(a,'publish-manifest.json'));
    const keep=new Set(manifest.objects.map(o=>o.key));
    const orphans=process.argv.includes('--keep-existing') ? [] : await pruneOrphans(keep,{listPage:cfListPage(fetch),deleteKey:(key,bucket)=>wranglerDelete(bucket,key)});
    if(orphans.length) console.log(`Deleted ${orphans.length} orphan R2 object${orphans.length===1?'':'s'}`);
    // Only expose links to the build after every public object verifies.
    const files=manifest.format===V2?['finder-catalog.json','legacy-keys.json','crossflash-links.json', ...CAPABILITY_FILES]:['pioneer-firmware-index.json','firmware-index.json'];
    for(const file of files) await fs.copyFile(path.join(a,file),path.join(SITE,'src/data',file));
    return;
  }
  throw new Error('Usage: firmware-release.mjs release EXTRACTOR STAGE [V3_HOARD] | prepare EXTRACTOR STAGE [V3_HOARD] | extract ARCHIVE STAGE | publish STAGE');
}
if(process.argv[1] && realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))) main().catch(e=>{console.error(e.message);process.exitCode=1;});
