import test from 'node:test';
import assert from 'node:assert/strict';
import {firmwareInputs,firmwareInputText} from '../src/lib/firmware-report-inputs.mjs';
import worker from '../workers/firmware-email.mjs';
const sha='a'.repeat(64);
const inputs=[{role:'target',operation:'abc123',filename:'target.bin',bytes:2097152,sha256:sha,available:true,archive_path:`firmware/${sha}/target.bin`},
 {role:'current',operation:'abc123',available:false,missing_reason:'No complete capture available.'}];
test('input metadata is bounded and requires exact attachment identity',()=>{
 assert.deepEqual(firmwareInputs(inputs),inputs);
 for(const bad of [null,{},Array(129).fill(inputs[0]),[{...inputs[0],sha256:'bad'}],[{...inputs[0],archive_path:'../../other'}],[{...inputs[0],bytes:1e12}]]) assert.throws(()=>firmwareInputs(bad));
 assert.match(firmwareInputText(inputs),/target.bin/);
 assert.match(firmwareInputText(inputs),/No complete capture available/);
});
test('notification email lists the exact files and hashes inside its download',async()=>{
 const messages=[];
 const request=new Request('https://private/',{method:'POST',body:JSON.stringify({type:'flash-report',
 report_id:'12345678-1234-1234-1234-123456789abc',scope:'session',description:'Reproduce rejection',firmware_inputs:inputs,
 url:`https://freemkv.org/api/flash-reports/download/12345678-1234-1234-1234-123456789abc?token=${sha}`})});
 const response=await worker.fetch(request,{REPORT_TO:'maintainer@example.com',EMAIL:{send:async m=>{messages.push(m);return {messageId:'test'};}}});
 assert.equal(response.status,200);
 assert.match(messages[0].text,/Reproduce rejection/);
 assert.match(messages[0].text,/target.bin/);
 assert.ok(messages[0].text.includes(sha));
 assert.match(messages[0].text,/No complete capture available/);
});
