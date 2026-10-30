import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { crossflashGraph, seedCrossflashCache, readCrossflashCache } from './firmware-crossflash-cache.mjs';
const hash = raw => createHash('sha256').update(raw).digest('hex');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'firmware-graph-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const engine = path.join(dir, 'engine'); await fs.writeFile(engine, 'exact engine');
  const cacheFile = path.join(dir, 'cache.json'), root = path.join(dir, 'payloads');
  const objects = [];
  for (const [family, data] of [['pioneer','a'], ['pioneer','b'], ['mediatek','c']]) {
    const sha256 = hash(data), key = `fw/${family}/${sha256}.tar`;
    await fs.mkdir(path.dirname(path.join(root,key)), {recursive:true}); await fs.writeFile(path.join(root,key),data);
    objects.push({family,key,sha256});
  }
  const graph = { format:'freemkv-crossflash-links', version:2, freemkv_flash:'test', links:{[objects[0].sha256]:[objects[1].sha256]}, future:{} };
  return {engine,cacheFile,root,objects,graph,onProgress:()=>{}};
}
test('unchanged bytes reuse complete graph; one addition checks only both directions within platform', async t => {
  const f = await fixture(t);
  await seedCrossflashCache({ ...f, file:f.cacheFile, objects:f.objects.slice(0,1), graph:{...f.graph,links:{}} });
  const calls = [];
  const result = await crossflashGraph({...f,run:async args => {calls.push(args); return JSON.stringify({status:args[2].includes(f.objects[0].sha256)?'yes':'soft_no'});}});
  assert.equal(calls.length,2); assert.equal(result.evaluated,2);
  assert.deepEqual(result.graph.evaluated_packages, f.objects.map(o => o.sha256).sort());
  assert.deepEqual(result.graph.links[f.objects[0].sha256],[f.objects[1].sha256]);
  assert.deepEqual(result.graph.future[f.objects[1].sha256],[f.objects[0].sha256]);
  const hit = await crossflashGraph({...f,run:async()=>assert.fail('unchanged graph must not run engine')});
  assert.deepEqual(hit.graph,result.graph);
  const removed = await crossflashGraph({...f,objects:[f.objects[0]],run:async()=>assert.fail('removal needs no new pairs')});
  assert.deepEqual(removed.graph.links,{}); assert.deepEqual(removed.graph.future,{});
  assert.deepEqual(removed.graph.evaluated_packages, [f.objects[0].sha256]);
});
test('engine changes invalidate all cached decisions', async t => {
  const f = await fixture(t); await seedCrossflashCache({...f,file:f.cacheFile});
  await fs.writeFile(f.engine,'new engine');
  let calls=0;
  await crossflashGraph({...f,run:async args => {calls++;assert.deepEqual(args,[path.join(f.root,'fw')]);return JSON.stringify(f.graph);}});
  assert.equal(calls,1);
});
test('corrupt cache and changed payload bytes fail closed', async t => {
  const f=await fixture(t); await seedCrossflashCache({...f,file:f.cacheFile});
  const doc=JSON.parse(await fs.readFile(f.cacheFile,'utf8'));doc.body.graph.links={};
  await fs.writeFile(f.cacheFile,JSON.stringify(doc));
  await assert.rejects(readCrossflashCache(f.cacheFile),/checksum/);
  await fs.writeFile(path.join(f.root,f.objects[0].key),'wrong');
  await assert.rejects(crossflashGraph(f),/payload mismatch/);
});
test('failed incremental checks leave last complete cache intact', async t => {
  const f=await fixture(t); await seedCrossflashCache({...f,file:f.cacheFile,objects:[f.objects[0]],graph:{...f.graph,links:{}}});
  const before=await fs.readFile(f.cacheFile,'utf8');
  await assert.rejects(crossflashGraph({...f,run:async()=>JSON.stringify({status:'unknown'})}),/verdict/);
  assert.equal(await fs.readFile(f.cacheFile,'utf8'),before);
});

test('conditional routes survive incremental caching without inventing a reverse route', async t => {
  const f = await fixture(t);
  await seedCrossflashCache({ ...f, file: f.cacheFile, objects: f.objects.slice(0, 1), graph: { ...f.graph, links: {} } });
  const result = await crossflashGraph({ ...f, run: async args => JSON.stringify({ status: args[2].includes(f.objects[0].sha256) ? 'conditional' : 'hard_no' }) });
  assert.deepEqual(result.graph.conditional, { [f.objects[0].sha256]: [f.objects[1].sha256] });
  assert.deepEqual(result.graph.links, {});
  assert.deepEqual(result.graph.future, {});
  const hit = await crossflashGraph({ ...f, run: async () => assert.fail('cache hit') });
  assert.deepEqual(hit.graph.conditional, result.graph.conditional);
});
