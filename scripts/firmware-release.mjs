// Prepare locally; publish only in an explicitly requested release workflow.
import { createHash } from 'node:crypto';
import { promises as fs, createReadStream, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createGunzip } from 'node:zlib';
import { firmwareObjectFetcher } from './firmware-object-fetch.mjs';
import { LATEST_ARCHIVE_KEY } from '../src/lib/firmware-archive.mjs';

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
  const rejected = new Set(withdrawals.map(row => row.normalSha256));
  const versions = Array.isArray(catalog)
    ? catalog.flatMap(model => (model.versions ?? []).map(v => v.normalSha256))
    : catalogPackages(catalog).map(p => p.normal_sha256);
  if (versions.some(sha => sha && rejected.has(sha))) throw new Error('Catalog contains withdrawn truncated firmware');
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
export async function prepare(extractor, destination, hoard) {
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
  await checkWithdrawals(catalog);
  checkStageV2(manifest, catalog, await json(path.join(destination, 'legacy-keys.json')));
  for (const o of manifest.objects) {
    const raw = await fs.readFile(path.join(destination, 'payloads', o.key));
    if (raw.length !== o.bytes || hash(raw) !== o.sha256) throw new Error('Payload hash/size mismatch');
  }
  const links = spawnSync(crossflashCommand(), [path.join(destination, 'payloads', 'fw')], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'] });
  if (links.status !== 0) throw new Error('freemkv-crossflash failed');
  checkCrossflashLinks(JSON.parse(links.stdout), catalog);
  await fs.writeFile(path.join(destination, 'crossflash-links.json'), links.stdout);
  // ustar deliberately excludes PAX records, links and platform metadata.
  run('tar',['--format=ustar','-czf',`${destination}.tar.gz`,'-C',destination,...V2_MEMBERS,'payloads'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
  console.log(`Prepared ${manifest.objects.length} objects: ${destination}.tar.gz`);
}
/** Every crossflash link must name packages of this catalogue. */
export function checkCrossflashLinks(links, catalog) {
  if (links?.format !== 'freemkv-crossflash-links' || links.version !== 1 || typeof links.links !== 'object') throw new Error('Invalid crossflash links');
  const shas = new Set();
  for (const i of catalog.identities) for (const r of i.revisions ?? []) for (const p of r.packages ?? []) shas.add(p.sha256);
  for (const [from, to] of Object.entries(links.links)) for (const s of [from, ...to]) if (!shas.has(s)) throw new Error(`Crossflash link names a package not in the catalogue: ${s}`);
}
const V1_MEMBERS = ['publish-manifest.json','pioneer-firmware-index.json','firmware-index.json'];
const V2_MEMBERS = ['publish-manifest.json','finder-catalog.json','legacy-keys.json'];
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
        if (!(name==='payloads' || name.startsWith('payloads/pioneer/') || [...V1_MEMBERS,...V2_MEMBERS].includes(name) || name==='payloads/pioneer' || name==='payloads/MT1939' || name==='payloads/MT1959' || /^payloads\/(MT1939|MT1959)\/[A-Za-z0-9._%-]+\.bin$/.test(name) || name==='payloads/fw' || /^payloads\/fw\/[a-z]+$/.test(name) || V2_KEY.test(name.slice('payloads/'.length)))) throw new Error('Unexpected tar member');
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
  if (manifest.format===V2) {
    const catalog=await json(path.join(directory,'finder-catalog.json'));
    await checkWithdrawals(catalog);
    checkStageV2(manifest,catalog,await json(path.join(directory,'legacy-keys.json')));
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
    const raw=await fs.readFile(path.join(directory,'payloads',o.key));
    if (raw.length!==o.bytes || hash(raw)!==o.sha256) throw new Error('Payload hash/size mismatch');
  }
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
        if (!await publicMatches(o)) {
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
  await Promise.all(Array.from({length:Math.min(4,pending.length)},()=>worker()));
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
async function main() {
  const [command,a,b,c]=process.argv.slice(2);
  if(command==='prepare' && a && b) return prepare(a,b,c);
  if(command==='extract' && a && b) return extract(a,b);
  if(command==='publish' && a) {
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
    const orphans=await pruneOrphans(keep,{listPage:cfListPage(fetch),deleteKey:(key,bucket)=>wranglerDelete(bucket,key)});
    if(orphans.length) console.log(`Deleted ${orphans.length} orphan R2 object${orphans.length===1?'':'s'}`);
    // Only expose links to the build after every public object verifies.
    const files=manifest.format===V2?['finder-catalog.json','legacy-keys.json']:['pioneer-firmware-index.json','firmware-index.json'];
    for(const file of files) await fs.copyFile(path.join(a,file),path.join(SITE,'src/data',file));
    return;
  }
  throw new Error('Usage: firmware-release.mjs prepare EXTRACTOR STAGE [V3_HOARD] | extract ARCHIVE STAGE | publish STAGE');
}
if(process.argv[1] && realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))) main().catch(e=>{console.error(e.message);process.exitCode=1;});
