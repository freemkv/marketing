import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadAllowlist, firmwareDownload} from '../src/lib/firmware-download.mjs';
import {catalog, mediatek, pioneer, SHA, V1_ONLY_SHA, MTK_ONLY_SHA} from './fixtures/finder-catalog.mjs';

const pkg = SHA.s13u102;
const legacyFile = `pioneer/BDR-S13U/SAT%209201/1.02EU/${pkg}.tar`;
const legacyKeys = {format:'freemkv-firmware-legacy-keys',version:1,keys:[
 {key:`pioneer/BDR-S13U/SAT%209201/1.02/${pkg}.tar`,sha256:pkg,new_key:`fw/pioneer/${pkg}.tar`,status:'published'},
 {key:'pioneer/WRONG/x.tar',sha256:pkg,new_key:`fw/pioneer/${SHA.s12}.tar`,status:'published'},
 {key:'MT1959/BW-16D1HT_3.02.bin',sha256:MTK_ONLY_SHA,new_key:null,status:'missing-bytes'},
]};
const allowed = downloadAllowlist({catalog:catalog(),mediatek:mediatek(),pioneer:pioneer(),legacyKeys});
const file = legacyFile;
function fixture({validation = {success:true,hostname:'freemkv.org',action:'firmware-download'}, object = {body:'firmware',size:8}} = {}) {
 const seen={verified:0,reads:[]};
 const env={FIRMWARE_TURNSTILE_SECRET:'secret',FIRMWARE_BUCKET:{async get(key){seen.reads.push(key);return object;}}};
 const fetcher=async (_url, options)=>{seen.verified++; seen.validationBody=JSON.parse(options.body); return Response.json(validation);};
 const request=(payload={package:pkg,token:'valid'},headers={})=>new Request('https://freemkv.org/api/firmware-download',{method:'POST',headers:{Origin:'https://freemkv.org','Content-Type':'application/json',...headers},body:JSON.stringify(payload)});
 return {seen,env,fetcher,request,run(req){return firmwareDownload(req,env,allowed,fetcher);}};
}
test('downloads by package sha256 only after server verification, named from the catalogue',async()=>{
 const f=fixture(), r=await f.run(f.request());
 assert.equal(r.status,200); assert.equal(await r.text(),'firmware');
 assert.equal(f.seen.verified,1);assert.deepEqual(f.seen.reads,[`fw/pioneer/${pkg}.tar`]);
 assert.equal(r.headers.get('cache-control'),'private, no-store');
 assert.equal(r.headers.get('content-type'),'application/x-tar');
 assert.equal(r.headers.get('content-disposition'),`attachment; filename="BDR-S13U_1.02_${pkg.slice(0,8)}.tar"; filename*=UTF-8''BDR-S13U_1.02_${pkg.slice(0,8)}.tar`);
 assert.equal(r.headers.get('access-control-allow-origin'),null);
});
test('legacy file keys resolve through the site index and legacy-keys.json to the same bytes',async()=>{
 for(const [legacy,read] of [[legacyFile,`fw/pioneer/${pkg}.tar`],[`pioneer/BDR-S13U/SAT%209201/1.02/${pkg}.tar`,`fw/pioneer/${pkg}.tar`],
   [`pioneer/BDR-UD04/SAT%208A10/1.14EU/${V1_ONLY_SHA}.tar`,`pioneer/BDR-UD04/SAT 8A10/1.14EU/${V1_ONLY_SHA}.tar`],
   ['MT1959/BW-16D1HT_3.02.bin','MT1959/BW-16D1HT_3.02.bin'],['MT1959/BU40N_1.00.bin',`fw/mediatek/${SHA.bu40}.bin`]]){
  const f=fixture(), r=await f.run(f.request({file:legacy,token:'valid'}));
  assert.equal(r.status,200,legacy);assert.deepEqual(f.seen.reads,[read]);
 }
 const f=fixture(); const r=await f.run(f.request({package:SHA.bu40,token:'valid'}));
 assert.equal(r.headers.get('content-type'),'application/octet-stream');
 assert.match(r.headers.get('content-disposition'),/filename="BU40N_1.00_/);
});
test('legacy key pointing at different bytes, unknown hashes and malformed packages are rejected before verification',async()=>{
 for(const payload of [{file:'pioneer/WRONG/x.tar'},{package:'f'.repeat(63)},{package:'0'.repeat(64)},{package:pkg.toUpperCase()},{package:[pkg]},{file:`fw/pioneer/${pkg}.tar`}]){
  const f=fixture();assert.equal((await f.run(f.request({...payload,token:'valid'}))).status,404,JSON.stringify(payload));assert.equal(f.seen.verified,0);
 }
});
test('GET, unconfigured service, cross-origin and plain curl never read bucket',async()=>{
 const f=fixture();
 assert.equal((await f.run(new Request('https://freemkv.org/api/firmware-download'))).status,405);
 assert.equal((await firmwareDownload(f.request(),{},allowed,f.fetcher)).status,503);
 assert.equal((await f.run(f.request(undefined,{Origin:'https://other.test'}))).status,403);
 assert.equal((await f.run(f.request({package:pkg}))).status,403);
 assert.deepEqual(f.seen.reads,[]); assert.equal(f.seen.verified,0);
});
test('forged, expired, replayed, wrong-host and wrong-action tokens fail closed',async()=>{
 for(const validation of [{success:false,'error-codes':['timeout-or-duplicate']},{success:false},{success:true,hostname:'other.test',action:'firmware-download'},{success:true,hostname:'freemkv.org',action:'other'}]){
  const f=fixture({validation}); assert.equal((await f.run(f.request())).status,403);assert.deepEqual(f.seen.reads,[]);
 }
});
test('paths must exactly match public catalogue before token consumption',async()=>{
 for(const path of ['../secret','private/file.tar',decodeURIComponent(legacyFile),legacyFile.replace('%20','%2520')]){
  const f=fixture();assert.equal((await f.run(f.request({file:path,token:'valid'}))).status,404);assert.equal(f.seen.verified,0);
 }
});
test('invalid JSON, oversized streams and token length rejected',async()=>{
 const f=fixture();const req=f.request();
 assert.equal((await f.run(new Request(req.url,{method:'POST',headers:req.headers,body:'{'}))).status,400);
 assert.equal((await f.run(f.request({package:pkg,token:'x'.repeat(9000)}))).status,413);
 assert.equal((await f.run(f.request({package:pkg,token:'x'.repeat(2049)}))).status,403);
 assert.equal((await f.run(f.request(null))).status,404);assert.deepEqual(f.seen.reads,[]);
});
test('verification outage never falls back to public URL or bucket read',async()=>{
 const f=fixture();
 for(const fetcher of [async()=>{throw Error('offline');},async()=>new Response('unavailable',{status:503}),async()=>new Response('not JSON')]){
  assert.equal((await firmwareDownload(f.request(),f.env,allowed,fetcher)).status,503);
 }
 assert.deepEqual(f.seen.reads,[]);
});
test('missing object and storage outage return actionable errors',async()=>{
 const f=fixture({object:null});assert.equal((await f.run(f.request())).status,404);
 f.env.FIRMWARE_BUCKET.get=async()=>{throw Error('storage');};assert.equal((await f.run(f.request())).status,503);
});

// ---- daily per-IP limit (KV FIRMWARE_RATELIMIT) ----
function limited(validation={success:true,hostname:'freemkv.org',action:'firmware-download'}) {
 const store=new Map(),puts=[];
 const kv={async get(k){return store.get(k)??null;},async put(k,v,o){puts.push([k,v,o]);store.set(k,v);}};
 const env={FIRMWARE_TURNSTILE_SECRET:'secret',FIRMWARE_RATELIMIT:kv,FIRMWARE_BUCKET:{async get(){return {body:'firmware',size:8};}}};
 const fetcher=async()=>Response.json(validation);
 const run=(ip,at)=>firmwareDownload(new Request('https://freemkv.org/api/firmware-download',{method:'POST',headers:{Origin:'https://freemkv.org','Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify({package:pkg,token:'valid'})}),env,allowed,fetcher,()=>at);
 return {store,puts,env,run};
}
const noon=Date.UTC(2026,9,2,12,0,0);
test('the 11th download in a UTC day gets 429 with Retry-After until midnight',async()=>{
 const l=limited();
 for(let i=0;i<10;i++) assert.equal((await l.run('203.0.113.5',noon+i)).status,200);
 const r=await l.run('203.0.113.5',noon);
 assert.equal(r.status,429);assert.equal(await r.text(),'Download limit reached.');
 assert.equal(r.headers.get('retry-after'),String(12*3600));
 assert.equal(l.store.get('dl:203.0.113.5:2026-10-02'),'10');
 assert.ok(l.puts.every(([,,o])=>o.expirationTtl===90000));
});
test('separate IPs are independent and a new UTC day resets the count',async()=>{
 const l=limited();
 for(let i=0;i<10;i++) await l.run('198.51.100.1',noon);
 assert.equal((await l.run('198.51.100.1',noon)).status,429);
 assert.equal((await l.run('198.51.100.2',noon)).status,200);
 assert.equal((await l.run('198.51.100.1',Date.UTC(2026,9,3,0,0,1))).status,200);
 assert.equal(l.store.get('dl:198.51.100.1:2026-10-03'),'1');
});
test('failed verification and unknown packages do not consume quota; missing binding fails open on the limit only',async()=>{
 const bad=limited({success:false});
 for(let i=0;i<12;i++) assert.equal((await bad.run('192.0.2.9',noon)).status,403);
 assert.equal(bad.puts.length,0);
 const l=limited();
 const r=await firmwareDownload(new Request('https://freemkv.org/api/firmware-download',{method:'POST',headers:{Origin:'https://freemkv.org','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.9'},body:JSON.stringify({package:'0'.repeat(64),token:'valid'})}),l.env,allowed,async()=>Response.json({success:true,hostname:'freemkv.org',action:'firmware-download'}),()=>noon);
 assert.equal(r.status,404);assert.equal(l.puts.length,0);
 delete l.env.FIRMWARE_RATELIMIT;
 for(let i=0;i<12;i++) assert.equal((await l.run('192.0.2.9',noon)).status,200);
 const denied=limited({success:false});delete denied.env.FIRMWARE_RATELIMIT;
 assert.equal((await denied.run('192.0.2.9',noon)).status,403);
});
