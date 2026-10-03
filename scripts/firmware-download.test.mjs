import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogueKeys, firmwareDownload} from '../src/lib/firmware-download.mjs';

const file = 'pioneer/BDR%20X/firmware.tar';
const allowed = catalogueKeys([{versions:[{file}, {file:null}]}]);
function fixture({validation = {success:true,hostname:'freemkv.org',action:'firmware-download'}, object = {body:'firmware',size:8}} = {}) {
 const seen={verified:0,reads:[]};
 const env={FIRMWARE_TURNSTILE_SECRET:'secret',FIRMWARE_BUCKET:{async get(key){seen.reads.push(key);return object;}}};
 const fetcher=async (_url, options)=>{seen.verified++; seen.validationBody=JSON.parse(options.body); return Response.json(validation);};
 const request=(payload={file,token:'valid'},headers={})=>new Request('https://freemkv.org/api/firmware-download',{method:'POST',headers:{Origin:'https://freemkv.org','Content-Type':'application/json',...headers},body:JSON.stringify(payload)});
 return {seen,env,fetcher,request,run(req){return firmwareDownload(req,env,allowed,fetcher);}};
}
test('downloads catalogue object only after server verification and decodes R2 key once',async()=>{
 const f=fixture(), r=await f.run(f.request());
 assert.equal(r.status,200); assert.equal(await r.text(),'firmware');
 assert.equal(f.seen.verified,1);assert.deepEqual(f.seen.reads,['pioneer/BDR X/firmware.tar']);
 assert.equal(r.headers.get('cache-control'),'private, no-store');
 assert.equal(r.headers.get('content-type'),'application/x-tar');
 assert.match(r.headers.get('content-disposition'),/attachment/);
 assert.equal(r.headers.get('access-control-allow-origin'),null);
});
test('GET, unconfigured service, cross-origin and plain curl never read bucket',async()=>{
 const f=fixture();
 assert.equal((await f.run(new Request('https://freemkv.org/api/firmware-download'))).status,405);
 assert.equal((await firmwareDownload(f.request(),{},allowed,f.fetcher)).status,503);
 assert.equal((await f.run(f.request(undefined,{Origin:'https://other.test'}))).status,403);
 assert.equal((await f.run(f.request({file}))).status,403);
 assert.deepEqual(f.seen.reads,[]); assert.equal(f.seen.verified,0);
});
test('forged, expired, replayed, wrong-host and wrong-action tokens fail closed',async()=>{
 for(const validation of [{success:false,'error-codes':['timeout-or-duplicate']},{success:false},{success:true,hostname:'other.test',action:'firmware-download'},{success:true,hostname:'freemkv.org',action:'other'}]){
  const f=fixture({validation}); assert.equal((await f.run(f.request())).status,403);assert.deepEqual(f.seen.reads,[]);
 }
});
test('paths must exactly match public catalogue before token consumption',async()=>{
 for(const path of ['../secret','private/file.tar','pioneer/BDR X/firmware.tar','pioneer/BDR%2520X/firmware.tar']){
  const f=fixture();assert.equal((await f.run(f.request({file:path,token:'valid'}))).status,404);assert.equal(f.seen.verified,0);
 }
});
test('invalid JSON, oversized streams and token length rejected',async()=>{
 const f=fixture();const req=f.request();
 assert.equal((await f.run(new Request(req.url,{method:'POST',headers:req.headers,body:'{'}))).status,400);
 assert.equal((await f.run(f.request({file,token:'x'.repeat(9000)}))).status,413);
 assert.equal((await f.run(f.request({file,token:'x'.repeat(2049)}))).status,403);
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
