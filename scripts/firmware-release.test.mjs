import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { safePath, validateManifest, extract, publish, pruneOrphans } from './firmware-release.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('release ingests by default; only explicit --refresh re-extracts the hoard', async t => {
 const d = await fs.mkdtemp(path.join(os.tmpdir(), 'firmware-release-mode-'));
 t.after(() => fs.rm(d, { recursive: true, force: true }));
 const log = path.join(d, 'calls.json');
 const fake = path.join(d, 'fwext');
 await fs.writeFile(fake, '#!/usr/bin/env node\n' +
  'require("node:fs").writeFileSync(process.env.CALL_LOG, JSON.stringify(process.argv.slice(2))); process.exit(7);\n', { mode: 0o755 });
 const script = new URL('./firmware-release.mjs', import.meta.url);
 for (const refresh of [false, true]) {
  const result = spawnSync(process.execPath, [script.pathname, 'release', d, path.join(d, 'stage'), path.join(d, 'custom-hoard'), ...(refresh ? ['--refresh'] : [])], {
   encoding: 'utf8', env: { ...process.env, FWEXT: fake, FREEMKV_FW: fake, FREEMKV_CROSSFLASH: fake, CALL_LOG: log },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /failed: 7/);
  assert.deepEqual(JSON.parse(await fs.readFile(log, 'utf8')), [refresh ? 'refresh' : 'ingest', '--hoard', path.join(d, 'custom-hoard')]);
  await assert.rejects(fs.access(path.join(d, 'stage')));
 }
 await fs.rm(log);
 const invalid = spawnSync(process.execPath, [script.pathname, 'release', d, path.join(d, 'stage'), '--refesh'], {
  encoding: 'utf8', env: { ...process.env, FWEXT: fake, CALL_LOG: log },
 });
 assert.equal(invalid.status, 1);
 assert.match(invalid.stderr, /Usage:/);
 await assert.rejects(fs.access(log));
});
test('reject unsafe paths and duplicate keys',()=>{
  for(const p of ['../x','/x','x/../y','x\\y','x//y']) assert.equal(safePath(p),false);
  const o={key:'pioneer/M/H/1.01EU/fw.tar',bytes:1,sha256:'a'.repeat(64)};
  assert.throws(()=>validateManifest({format:'freemkv-firmware-publish-v1',objects:[o,o]}));
});
async function fixture(t) {
 const d=await fs.mkdtemp(path.join(os.tmpdir(),'firmware-test-')); t.after(()=>fs.rm(d,{recursive:true,force:true}));
 const b=Buffer.from('firmware'),o={key:'pioneer/M/H/1.01EU/fw.tar',bytes:b.length,sha256:sha(b)};
 await fs.mkdir(path.join(d,'payloads/pioneer/M/H/1.01EU'),{recursive:true});await fs.writeFile(path.join(d,'payloads',o.key),b);
 await fs.writeFile(path.join(d,'publish-manifest.json'),JSON.stringify({format:'freemkv-firmware-publish-v1',objects:[o]}));
 await fs.writeFile(path.join(d,'pioneer-firmware-index.json'),JSON.stringify([{model:'M',versions:[{file:o.key,sha256:o.sha256,bytes:o.bytes}]}]));
 await fs.writeFile(path.join(d,'firmware-index.json'),'[]');return {d,b,o};
}
test('verify public bytes and abort on corruption before uploads',async t=>{
 const {d,b,o}=await fixture(t);let calls=0;
 assert.equal(await publish(d,async()=>{calls++},async()=>new Response(b)),1);assert.equal(calls,0);
 await assert.rejects(publish(d,async()=>{},async()=>new Response('bad'),async()=>{}),/verification/);
 await fs.writeFile(path.join(d,'payloads',o.key),'bad');calls=0;
 await assert.rejects(publish(d,async()=>{calls++},async()=>new Response(b)),/hash/);assert.equal(calls,0);
});
test('strict ustar roundtrip and rejects symbolic links',async t=>{
 const {d}=await fixture(t); const archive=d+'.tgz',out=d+'-out';t.after(()=>fs.rm(archive,{force:true}));t.after(()=>fs.rm(out,{recursive:true,force:true}));
 assert.equal(spawnSync('tar',['--format=ustar','-czf',archive,'-C',d,'publish-manifest.json','pioneer-firmware-index.json','firmware-index.json','payloads'],{env:{...process.env,COPYFILE_DISABLE:'1'}}).status,0);
 await extract(archive,out);assert.deepEqual(await fs.readFile(path.join(out,'publish-manifest.json')),await fs.readFile(path.join(d,'publish-manifest.json')));
 await fs.rm(out,{recursive:true});await fs.symlink('/etc/passwd',path.join(d,'payloads/pioneer/evil'));
 assert.equal(spawnSync('tar',['--format=ustar','-czf',archive,'-C',d,'payloads'],{env:{...process.env,COPYFILE_DISABLE:'1'}}).status,0);
 await assert.rejects(extract(archive,out),/Unsafe/);
});
test('MediaTek restoration participates in the same verified transaction',async t=>{
 const {d}=await fixture(t),b=Buffer.from('mtk'),o={key:'MT1939/BU40N_1.00.bin',bytes:b.length,sha256:sha(b)};
 const manifest=JSON.parse(await fs.readFile(path.join(d,'publish-manifest.json')));manifest.objects.push(o);
 await fs.writeFile(path.join(d,'publish-manifest.json'),JSON.stringify(manifest));
 await fs.mkdir(path.join(d,'payloads/MT1939'));await fs.writeFile(path.join(d,'payloads',o.key),b);
 await fs.writeFile(path.join(d,'firmware-index.json'),JSON.stringify([{model:'BU40N',versions:[{file:o.key,sha256:o.sha256}]}]));
 let count=0;assert.equal(await publish(d,async()=>{count++},async url=>new Response(url.includes('MT1939')?b:Buffer.from('firmware'))),2);assert.equal(count,0);
});
test('uploads at most four objects together and retries public visibility',async t=>{
 const {d,b,o}=await fixture(t); const objects=[],versions=[];
 for(let i=0;i<6;i++) {
  const item={...o,key:`pioneer/M/H/1.0${i}/fw.tar`};objects.push(item);versions.push({file:item.key,sha256:item.sha256,bytes:item.bytes});
  await fs.mkdir(path.dirname(path.join(d,'payloads',item.key)),{recursive:true});await fs.writeFile(path.join(d,'payloads',item.key),b);
 }
 await fs.writeFile(path.join(d,'publish-manifest.json'),JSON.stringify({format:'freemkv-firmware-publish-v1',objects}));
 await fs.writeFile(path.join(d,'pioneer-firmware-index.json'),JSON.stringify([{model:'M',versions}]));
 let active=0,max=0,uploads=0;const ready=new Set(),reads=new Map();
 const upload=async item=>{active++;max=Math.max(max,active);uploads++;await new Promise(r=>setTimeout(r,5));ready.add(item.key);active--;};
 const fetcher=async url=>{
  const key=objects.find(item=>url.endsWith(item.key)).key;
  if(!ready.has(key))return new Response('',{status:404});
  const n=(reads.get(key)||0)+1;reads.set(key,n);
  return n===1?new Response('',{status:503}):new Response(b);
 };
 assert.equal(await publish(d,upload,fetcher,async()=>{}),6);assert.equal(uploads,6);assert.equal(max,4);
});
test('public URL uses prepared percent-encoded path exactly once',async t=>{
 const {d,b,o}=await fixture(t),key='pioneer/M/SAT%208A10/1.01EU/fw.tar';
 const item={...o,key};await fs.mkdir(path.dirname(path.join(d,'payloads',key)),{recursive:true});await fs.writeFile(path.join(d,'payloads',key),b);
 await fs.writeFile(path.join(d,'publish-manifest.json'),JSON.stringify({format:'freemkv-firmware-publish-v1',objects:[item]}));
 await fs.writeFile(path.join(d,'pioneer-firmware-index.json'),JSON.stringify([{model:'M',versions:[{file:key,sha256:item.sha256,bytes:item.bytes}]}]));
 let called=false;assert.equal(await publish(d,async()=>assert.fail('already hosted'),async url=>{called=true;assert.ok(url.endsWith('/pioneer/M/SAT%208A10/1.01EU/fw.tar'));return new Response(b);}),1);assert.ok(called);
});
test('CLI runs when invoked through a symbolic-link path',async t=>{
 const d=await fs.mkdtemp(path.join(os.tmpdir(),'firmware-cli-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));
 const link=path.join(d,'release.mjs');await fs.symlink(new URL('./firmware-release.mjs',import.meta.url),link);
 const result=spawnSync(process.execPath,[link],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/Usage: firmware-release/);
});

// A future stale draft release must not reintroduce known-corrupt payloads.
test('withdrawn Normal hashes cannot re-enter a prepared or published catalog', async () => {
  const {rejectWithdrawn}=await import('./firmware-release.mjs');
  assert.throws(()=>rejectWithdrawn([{versions:[{normalSha256:'a'.repeat(64)}]}],[{normalSha256:'a'.repeat(64)}]),/withdrawn/);
  assert.doesNotThrow(()=>rejectWithdrawn([{versions:[{normalSha256:'b'.repeat(64)}]}],[{normalSha256:'a'.repeat(64)}]));
});

// ---- manifest v2: content-addressed fw/<family>/<sha256>.<ext> ----
const {checkStageV2,rejectWithdrawn,prepare,V2_KEY}=await import('./firmware-release.mjs');
async function stageV2(t,{withdrawn=false}={}) {
 const d=await fs.mkdtemp(path.join(os.tmpdir(),'firmware-v2-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));
 const tarBytes=Buffer.from('pioneer package'),binBytes=Buffer.from('mediatek image');
 const t1=sha(tarBytes),b1=sha(binBytes);
 const objects=[{key:`fw/pioneer/${t1}.tar`,sha256:t1,bytes:tarBytes.length,filename:`BDR-S13U_1.02_9201_ID43_${t1.slice(0,8)}.tar`,family:'pioneer',content_type:'application/x-tar'},
  {key:`fw/mediatek/${b1}.bin`,sha256:b1,bytes:binBytes.length,filename:`BU40N_1.00_${b1.slice(0,8)}.bin`,family:'mediatek',content_type:'application/octet-stream'}];
 const normal=withdrawn?'c7655b9b4db452231834aeb994f47eb8794b1a33c8bd5f2f5a0fea50475ab7be':'9'.repeat(64);
 const catalog={format:'freemkv-finder-catalog',version:2,aliases:[],withdrawn:[],identities:[
  {key:'pioneer:9201:ID43',family:'pioneer',hardware:'9201',destination:'ID43',revisions:[{revision:'1.02',packages:[{...objects[0],normal_sha256:normal}]}],other_candidates:[]},
  {key:'mediatek:BU40N:GENERAL',family:'mediatek',hardware:'BU40N',destination:'GENERAL',revisions:[{revision:'1.00',packages:[objects[1]]}],other_candidates:[]}]};
 const legacy={format:'freemkv-firmware-legacy-keys',version:1,keys:[{key:`pioneer/BDR-S13U/SAT%209201/1.02EU/${t1}.tar`,sha256:t1,new_key:objects[0].key,status:'published'},
  {key:'MT1939/OLD.bin','sha256':'7'.repeat(64),new_key:null,status:'missing-bytes'}]};
 for(const [o,b] of [[objects[0],tarBytes],[objects[1],binBytes]]){await fs.mkdir(path.dirname(path.join(d,'payloads',o.key)),{recursive:true});await fs.writeFile(path.join(d,'payloads',o.key),b);}
 await fs.writeFile(path.join(d,'publish-manifest.json'),JSON.stringify({format:'freemkv-firmware-publish-v2',objects}));
 await fs.writeFile(path.join(d,'finder-catalog.json'),JSON.stringify(catalog));
 await fs.writeFile(path.join(d,'legacy-keys.json'),JSON.stringify(legacy));
 await fs.writeFile(path.join(d,'firmware-index.json'),'[]');
 return {d,objects,catalog,legacy,bytes:new Map([[objects[0].key,tarBytes],[objects[1].key,binBytes]])};
}
test('v2 manifest accepts only content-addressed keys matching their hash, once per package',()=>{
 const h='a'.repeat(64),o={key:`fw/pioneer/${h}.tar`,sha256:h,bytes:1,filename:'M_1.00_aaaaaaaa.tar',content_type:'application/x-tar'};
 const v=objects=>validateManifest({format:'freemkv-firmware-publish-v2',objects});
 assert.doesNotThrow(()=>v([o]));
 assert.ok(V2_KEY.test(o.key));
 for(const bad of [{...o,key:`fw/pioneer/${'b'.repeat(64)}.tar`},{...o,key:`fw/evil/${h}.tar`},{...o,key:`pioneer/${h}.tar`},{...o,key:`fw/pioneer/${h}.exe`},
   {...o,filename:'../x.tar'},{...o,filename:'a"b.tar'},{...o,content_type:'text/html'},{...o,family:'mediatek'},{...o,bytes:0}]) assert.throws(()=>v([bad]),JSON.stringify(bad));
 assert.throws(()=>v([o,{...o,key:`fw/mediatek/${h}.bin`,content_type:'application/octet-stream'}]),/duplicate/);
});
test('v2 stage cross-checks catalogue packages, objects and legacy keys',async t=>{
 const {objects,catalog,legacy}=await stageV2(t);const manifest={format:'freemkv-firmware-publish-v2',objects};
 assert.doesNotThrow(()=>checkStageV2(manifest,catalog,legacy));
 const c2=structuredClone(catalog);c2.identities[0].revisions[0].packages[0].filename='other.tar';
 assert.throws(()=>checkStageV2(manifest,c2,legacy),/mismatch/);
 const c3=structuredClone(catalog);c3.identities.pop();assert.throws(()=>checkStageV2(manifest,c3,legacy),/Unreferenced/);
 const l2=structuredClone(legacy);l2.keys[0].new_key=objects[1].key;assert.throws(()=>checkStageV2(manifest,catalog,l2),/does not resolve/);
 const l3=structuredClone(legacy);l3.keys[1].status='published';assert.throws(()=>checkStageV2(manifest,catalog,l3),/Unresolved/);
 assert.throws(()=>rejectWithdrawn({...catalog,identities:[{...catalog.identities[0],revisions:[{revision:'1',packages:[{normal_sha256:'a'.repeat(64)}]}]}]},[{normalSha256:'a'.repeat(64)}]),/withdrawn/);
});
test('v2 publish uploads each content-addressed object once and verifies bytes',async t=>{
 const {d,objects,bytes}=await stageV2(t);const uploaded=[];const live=new Set();
 const fetcher=async url=>{const key=url.split('.r2.dev/')[1];return live.has(key)?new Response(bytes.get(key)):new Response('',{status:404});};
 assert.equal(await publish(d,async o=>{uploaded.push(o.key);live.add(o.key);},fetcher,async()=>{}),2);
 assert.deepEqual(uploaded.sort(),objects.map(o=>o.key).sort());
 uploaded.length=0;assert.equal(await publish(d,async o=>uploaded.push(o.key),fetcher),2);assert.deepEqual(uploaded,[]);
});
test('v2 publish refuses withdrawn Normal hashes and corrupt payloads before any upload',async t=>{
 const w=await stageV2(t,{withdrawn:true});await assert.rejects(publish(w.d,async()=>assert.fail('upload'),async()=>assert.fail('fetch')),/withdrawn/);
 const c=await stageV2(t);await fs.writeFile(path.join(c.d,'payloads',c.objects[0].key),'bad');
 await assert.rejects(publish(c.d,async()=>assert.fail('upload'),async()=>new Response('')),/hash/);
});
test('v2 archive roundtrip through strict extraction',async t=>{
 const {d}=await stageV2(t);const archive=d+'.tgz',out=d+'-out';t.after(()=>fs.rm(archive,{force:true}));t.after(()=>fs.rm(out,{recursive:true,force:true}));
 assert.equal(spawnSync('tar',['--format=ustar','-czf',archive,'-C',d,'publish-manifest.json','finder-catalog.json','legacy-keys.json','firmware-index.json','payloads'],{env:{...process.env,COPYFILE_DISABLE:'1'}}).status,0);
 await extract(archive,out);
 assert.deepEqual(await fs.readFile(path.join(out,'finder-catalog.json')),await fs.readFile(path.join(d,'finder-catalog.json')));
 await fs.rm(out,{recursive:true});await fs.writeFile(path.join(d,'payloads/fw/pioneer/notahash.tar'),'x');
 assert.equal(spawnSync('tar',['--format=ustar','-czf',archive,'-C',d,'payloads'],{env:{...process.env,COPYFILE_DISABLE:'1'}}).status,0);
 await assert.rejects(extract(archive,out),/Unexpected/);
});
test('pruneOrphans deletes every R2 key not in the fresh manifest, paginating the list',async()=>{
  const pages=[
    {objects:[{key:'fw/pioneer/a.tar'},{key:'fw/pioneer/b.tar'}],truncated:true,cursor:'c1'},
    {objects:[{key:'fw/mediatek/c.bin'},{key:'fw/pioneer/d.tar'}],truncated:false},
  ];
  const seen=[];const deleted=[];
  const listPage=async({cursor})=>{seen.push(cursor??null);return pages[seen.length-1];};
  const orphans=await pruneOrphans(new Set(['fw/pioneer/b.tar','fw/pioneer/d.tar']),{listPage,deleteKey:async k=>deleted.push(k)});
  assert.deepEqual(seen,[null,'c1']);
  assert.deepEqual(orphans.sort(),['fw/mediatek/c.bin','fw/pioneer/a.tar']);
  assert.deepEqual(deleted.sort(),['fw/mediatek/c.bin','fw/pioneer/a.tar']);
  assert.deepEqual(await pruneOrphans(new Set(['fw/pioneer/a.tar','fw/pioneer/b.tar']),{listPage:async()=>({objects:[{key:'fw/pioneer/a.tar'},{key:'fw/pioneer/b.tar'}],truncated:false}),deleteKey:async()=>assert.fail('no delete')}),[]);
});
test('prepare runs fwext publish-catalog and freemkv-crossflash against the hoard and packs a validated stage',async t=>{
 const {d:template}=await stageV2(t);const root=await fs.mkdtemp(path.join(os.tmpdir(),'firmware-prepare-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const fake=path.join(root,'fwext');const log=path.join(root,'args.json');
 await fs.writeFile(fake,`#!/usr/bin/env node
const fs=require('fs');const a=process.argv.slice(2);fs.writeFileSync(${JSON.stringify(log)},JSON.stringify(a));
const out=a[a.indexOf('--out')+1];fs.cpSync(${JSON.stringify(template)},out,{recursive:true});fs.rmSync(out+'/firmware-index.json');
`);await fs.chmod(fake,0o755);
 const fakeLinks=path.join(root,'freemkv-crossflash');
 await fs.writeFile(fakeLinks,`#!/usr/bin/env node
process.stdout.write(JSON.stringify({format:'freemkv-crossflash-links',version:1,links:{}}));
`);await fs.chmod(fakeLinks,0o755);
 const previousLinks=process.env.FREEMKV_CROSSFLASH;process.env.FREEMKV_CROSSFLASH=fakeLinks;t.after(()=>{if(previousLinks===undefined)delete process.env.FREEMKV_CROSSFLASH;else process.env.FREEMKV_CROSSFLASH=previousLinks;});
 await fs.mkdir(path.join(root,'extractor'));const stage=path.join(root,'stage');const previous=process.env.FWEXT;process.env.FWEXT=fake;t.after(()=>{if(previous===undefined)delete process.env.FWEXT;else process.env.FWEXT=previous;});
 await prepare(path.join(root,'extractor'),stage,path.join(root,'hoard'));
 const args=JSON.parse(await fs.readFile(log,'utf8'));
 assert.deepEqual(args.slice(0,5),['publish-catalog','--hoard',path.join(root,'hoard'),'--out',stage]);
 for(const flag of ['--legacy-pioneer','--flasher','--withdrawals']) assert.ok(args.includes(flag));
 await fs.access(stage+'.tar.gz');await fs.access(path.join(stage,'crossflash-links.json'));
 await assert.rejects(prepare(path.join(root,'extractor'),stage,path.join(root,'hoard')),/already exists/);
});

test('pruning retains the unlisted latest archive',async()=>{
 const deleted=[];
 assert.deepEqual(await pruneOrphans(new Set(),{listPage:async()=>({objects:[{key:'releases/latest.tar.gz'},{key:'fw/pioneer/old.tar'}],truncated:false}),deleteKey:async key=>deleted.push(key)}),['fw/pioneer/old.tar']);
 assert.deepEqual(deleted,['fw/pioneer/old.tar']);
});
