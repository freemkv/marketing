import test from 'node:test';
import assert from 'node:assert/strict';
import {firmwareObjectFetcher} from './firmware-object-fetch.mjs';
const env={FIRMWARE_R2_ACCESS:'private',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'test-token'};
test('public verification remains unchanged until explicit migration',()=>{
 const fetcher=()=>{};assert.equal(firmwareObjectFetcher({},fetcher),fetcher);
});
test('private verification uses authenticated API and preserves escaped object path',async()=>{
 let seen;const read=firmwareObjectFetcher(env,async(url,options)=>{seen={url,options};return new Response('data');});
 const r=await read('https://pub-10fe57a98db44568abcfb5db130d3b3f.r2.dev/pioneer/M/SAT%208A10/F%2520.tar');
 assert.equal(await r.text(),'data');
 assert.equal(seen.url,`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets/freemkv-firmware/objects/pioneer/M/SAT%208A10/F%2520.tar`);
 assert.equal(seen.options.headers.get('Authorization'),'Bearer test-token');
 assert.equal(seen.options.redirect,'error');
});
test('private mode requires credentials and cannot forward token to another origin',()=>{
 assert.throws(()=>firmwareObjectFetcher({FIRMWARE_R2_ACCESS:'private'}));
 assert.throws(()=>firmwareObjectFetcher({FIRMWARE_R2_ACCESS:'typo'}));
 const read=firmwareObjectFetcher(env,()=>assert.fail('network must not run'));
 assert.throws(()=>read('https://evil.test/file.tar'));
});
