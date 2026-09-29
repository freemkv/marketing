// Withdraw proven-invalid published objects, including historical aliases.
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {safePath} from './firmware-release.mjs';
const rows=JSON.parse(await readFile(new URL('./firmware-withdrawals.json',import.meta.url),'utf8'));
for(const row of rows){
  if(!safePath(row.key)||!row.key.startsWith('pioneer/')||!row.key.endsWith('.tar')||!/^[a-f0-9]{64}$/.test(row.normalSha256))throw new Error('Invalid withdrawal receipt');
}
for(const row of rows){
  const result=spawnSync('./node_modules/.bin/wrangler',['r2','object','delete',`freemkv-firmware/${row.key}`,'--remote'],{stdio:'inherit'});
  if(result.error||result.status!==0)throw new Error(`Withdrawal failed: ${row.key}`);
  const response=await fetch(`https://pub-10fe57a98db44568abcfb5db130d3b3f.r2.dev/${row.key}`,{headers:{'User-Agent':'curl/8.0'},signal:AbortSignal.timeout(60000)});
  await response.body?.cancel();
  if(response.status!==404)throw new Error(`Withdrawn object still public: ${row.key} (${response.status})`);
}
console.log(`Withdrew ${rows.length} proven-invalid firmware objects`);
