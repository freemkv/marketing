import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { safePath, validateManifest, extract, publish } from './firmware-release.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
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
