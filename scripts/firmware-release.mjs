// Prepare locally; publish only in an explicitly requested release workflow.
import { createHash } from 'node:crypto';
import { promises as fs, createReadStream, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createGunzip } from 'node:zlib';
import { firmwareObjectFetcher } from './firmware-object-fetch.mjs';

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
const segment = s => encodeURIComponent(s).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
// Publication model names can expand source notation. The already validated
// bytes are located by hardware/release/full hash, independently of display name.
const identity = (_model, h, r, sha) => JSON.stringify([h,r,sha]);
export function validateManifest(m) {
  if (m.format !== 'freemkv-firmware-publish-v1' || !Array.isArray(m.objects) || !m.objects.length) throw new Error('Invalid publish manifest');
  const seen = new Set();
  for (const o of m.objects) {
    if (!safePath(o.key) || !((o.key.startsWith('pioneer/') && o.key.endsWith('.tar')) || /^(MT1939|MT1959)\/[A-Za-z0-9._%-]+\.bin$/.test(o.key)) || !/^[a-f0-9]{64}$/.test(o.sha256) || !Number.isSafeInteger(o.bytes) || o.bytes <= 0 || o.bytes > 64*1024*1024 || seen.has(o.key)) throw new Error('Invalid or duplicate object');
    seen.add(o.key);
  }
  return m;
}
export function rejectWithdrawn(catalog, withdrawals) {
  const rejected = new Set(withdrawals.map(row => row.normalSha256));
  for (const model of catalog) for (const version of model.versions ?? []) {
    if (rejected.has(version.normalSha256)) throw new Error('Catalog contains withdrawn truncated firmware');
  }
}
async function checkWithdrawals(catalog) {
  rejectWithdrawn(catalog, await json(path.join(SITE,'scripts/firmware-withdrawals.json')));
}
export async function prepare(extractor, destination, mediaMapping) {
  extractor = path.resolve(extractor); destination = path.resolve(destination);
  await fs.mkdir(destination); // Fail if an old staging directory exists.
  const catalogFile = path.join(destination, 'pioneer-firmware-index.json');
  run('cargo', ['run','--quiet','--release','--features','internal-tools','--bin','pioneer-finder-index','--',path.join(extractor,'hoard/installers/pioneer'),'--output',catalogFile], {cwd:extractor});
  const catalog = await json(catalogFile);
  await checkWithdrawals(catalog);
  const index = await json(path.join(extractor,'hoard/installers/pioneer/INDEX.json'));
  const sources = new Map();
  for (const row of index.packages) {
    if (!row.advertised_version || !safePath(row.path)) throw new Error('Unsafe or outdated installer index');
    sources.set(identity(row.public_model ?? row.model,row.hardware,row.advertised_version,row.sha256), row);
  }
  const objects = new Map();
  for (const model of catalog) {
    for (const v of model.versions) {
      const row = sources.get(identity(model.model,v.hardware,v.rev,v.sha256));
      if (!row) throw new Error('Catalog release missing from source index');
      const key = `pioneer/${segment(model.model)}/${segment(v.hardware)}/${segment(v.rev)}/${v.sha256}.tar`;
      const raw = await fs.readFile(path.join(extractor,'hoard',row.path));
      if (hash(raw) !== v.sha256 || raw.length !== v.bytes) throw new Error('Source changed after validation');
      const output = path.join(destination,'payloads',key);
      await fs.mkdir(path.dirname(output),{recursive:true});
      await fs.writeFile(output,raw);
      objects.set(key,{key,sha256:v.sha256,bytes:raw.length});
      v.file = key;
    }
    model.ready = model.versions.some(v => Boolean(v.file));
  }
  if (mediaMapping) {
    for (const entry of await json(mediaMapping)) {
      const {key,sha256,bytes}=entry;
      validateManifest({format:'freemkv-firmware-publish-v1',objects:[{key,sha256,bytes}]});
      if (!/^(MT1939|MT1959)\//.test(key)) throw new Error('Media mapping must contain MediaTek objects');
      const raw=await fs.readFile(entry.path);
      if(raw.length!==bytes || hash(raw)!==sha256) throw new Error('MediaTek source hash/size mismatch');
      const output=path.join(destination,'payloads',key);
      await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,raw);
      objects.set(key,{key,sha256,bytes});
    }
  }
  await fs.writeFile(catalogFile, JSON.stringify(catalog,null,2)+'\n');
  await fs.copyFile(path.join(SITE,'src/data/firmware-index.json'),path.join(destination,'firmware-index.json'));
  await fs.writeFile(path.join(destination,'publish-manifest.json'),JSON.stringify(validateManifest({format:'freemkv-firmware-publish-v1',objects:[...objects.values()]}),null,2)+'\n');
  // ustar deliberately excludes PAX records, links and platform metadata.
  run('tar',['--format=ustar','-czf',`${destination}.tar.gz`,'-C',destination,'publish-manifest.json','pioneer-firmware-index.json','firmware-index.json','payloads'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
  console.log(`Prepared ${objects.size} objects: ${destination}.tar.gz`);
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
        if (!(name==='payloads' || name.startsWith('payloads/pioneer/') || ['publish-manifest.json','pioneer-firmware-index.json','firmware-index.json'].includes(name) || name==='payloads/pioneer' || name==='payloads/MT1939' || name==='payloads/MT1959' || /^payloads\/(MT1939|MT1959)\/[A-Za-z0-9._%-]+\.bin$/.test(name))) throw new Error('Unexpected tar member');
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
  const pioneer=await json(path.join(directory,'pioneer-firmware-index.json'));
  await checkWithdrawals(pioneer);
  const mediatek=await json(path.join(directory,'firmware-index.json'));
  if (!Array.isArray(pioneer) || !pioneer.length || !Array.isArray(mediatek)) throw new Error('Invalid staged catalogs');
  const objects=new Map(manifest.objects.map(o=>[o.key,o]));
  const used=new Set();
  for (const m of pioneer) {
    if (typeof m.model !== 'string' || !Array.isArray(m.versions) || !m.versions.length) throw new Error('Invalid catalog model');
    for (const v of m.versions) {
    const o=objects.get(v.file);
    if (!o || o.sha256!==v.sha256 || o.bytes!==v.bytes) throw new Error('Catalog/object mismatch');
    used.add(v.file);
    }
  }
  for (const m of mediatek) for (const v of m.versions ?? []) {
    const o=objects.get(v.file);
    if (o) {
      if (o.sha256!==v.sha256 || (v.bytes != null && o.bytes!==v.bytes)) throw new Error('MediaTek catalog/object mismatch');
      used.add(v.file);
    }
  }
  if (used.size!==objects.size) throw new Error('Unreferenced object');
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
async function main() {
  const [command,a,b,c]=process.argv.slice(2);
  if(command==='prepare' && a && b) return prepare(a,b,c);
  if(command==='extract' && a && b) return extract(a,b);
  if(command==='publish' && a) {
    if(!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) throw new Error('Explicit Cloudflare account and token required');
    await publish(a,(o,file)=>new Promise((resolve,reject)=>{
      const child=spawn(path.join(SITE,'node_modules/.bin/wrangler'),['r2','object','put',`freemkv-firmware/${o.key}`,'--file',file,'--content-type',o.key.endsWith('.tar')?'application/x-tar':'application/octet-stream','--remote'],{stdio:'inherit',env:process.env});
      child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(new Error(`Wrangler upload failed: ${code ?? signal}`)));
    }),firmwareObjectFetcher());
    // Only expose links to the build after every public object verifies.
    for(const file of ['pioneer-firmware-index.json','firmware-index.json']) await fs.copyFile(path.join(a,file),path.join(SITE,'src/data',file));
    return;
  }
  throw new Error('Usage: firmware-release.mjs prepare EXTRACTOR STAGE [MEDIA_MAPPING.json] | extract ARCHIVE STAGE | publish STAGE');
}
if(process.argv[1] && realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url))) main().catch(e=>{console.error(e.message);process.exitCode=1;});
