import test from 'node:test';
import assert from 'node:assert/strict';
import { latestFirmwareArchive, LATEST_ARCHIVE_KEY } from '../src/lib/firmware-archive.mjs';
const body = '0123456789';
const metadata = {size:10, etag:'tag', httpEtag:'"tag"', uploaded:new Date(0), customMetadata:{sha256:'abc'}};
function bucket(changed=false) {return {head:async key=>{assert.equal(key,LATEST_ARCHIVE_KEY);return metadata;},get:async(key,options)=>{assert.equal(options.onlyIf.etagMatches,'tag');return changed ? {} : {body:options.range ? body.slice(options.range.offset,options.range.offset+options.range.length):body};}};}
test('unlisted archive streams whole files and valid ranges',async()=>{
 for(const [range,status,expected] of [[null,200,body],['bytes=2-4',206,'234'],['bytes=-3',206,'789']]){
  const response=await latestFirmwareArchive(new Request('https://example/fw/latest.tar.gz',{headers:range?{Range:range}:{}}),{FIRMWARE_BUCKET:bucket()});
  assert.equal(response.status,status);assert.equal(await response.text(),expected);assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
 }
});
test('invalid ranges and concurrent replacements never stream mismatched bytes',async()=>{
 const response=await latestFirmwareArchive(new Request('https://example/',{headers:{Range:'bytes=20-30'}}),{FIRMWARE_BUCKET:bucket()});assert.equal(response.status,416);
 const changed=await latestFirmwareArchive(new Request('https://example/'),{FIRMWARE_BUCKET:bucket(true)});assert.equal(changed.status,412);assert.equal(changed.headers.get('Content-Length'),null);
});
test('HEAD and unsupported methods',async()=>{
 const head=await latestFirmwareArchive(new Request('https://example/',{method:'HEAD'}),{FIRMWARE_BUCKET:bucket()});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('Content-Length'),'10');
 assert.equal((await latestFirmwareArchive(new Request('https://example/',{method:'POST'}),{})).status,405);
});
