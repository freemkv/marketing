import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const script = resolve('scripts/announce-release.sh');
function fixture(t) {
 const root=mkdtempSync(join(tmpdir(),'announce-test-')); t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const dir of ['bin','.github','src/content/docs/docs']) mkdirSync(join(root,dir),{recursive:true});
 writeFileSync(join(root,'.github/announced-versions.txt'),'1.8.0\n');
 writeFileSync(join(root,'src/content/docs/docs/changelog.md'),'## 1.8.1\n\n<small>2026-10-05</small>\n\nA release.\n');
 const mock=(name,body)=>writeFileSync(join(root,'bin',name),'#!/bin/bash\n'+body,{mode:0o755});
 mock('git','if [ "$1" = ls-remote ]; then [ ! -f claim ] || echo claimed; exit 0; fi\necho abc123\n');
 mock('gh','touch claim\n');
 mock('curl','cat >/dev/null\necho sent >> sends\nexit "${SEND_FAILURE:-0}"\n');
 const run=(extra={})=>spawnSync('bash',[script],{cwd:root,encoding:'utf8',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH,HOOK:'https://invalid.example',GITHUB_REPOSITORY:'test/repo',...extra}});
 return {root,run};
}
test('repeated deploys and manual dispatch announce a version at most once',t=>{
 const {root,run}=fixture(t);
 assert.equal(run().status,0); assert.equal(run({EVENT:'workflow_dispatch',VER_INPUT:'1.8.1'}).status,0);
 assert.equal(readFileSync(join(root,'sends'),'utf8'),'sent\n');
});
test('existing releases do not get re-announced during migration',t=>{
 const {root,run}=fixture(t); assert.equal(run({VER_INPUT:'1.8.0'}).status,0); assert.equal(existsSync(join(root,'sends')),false);
});
test('ambiguous send failure keeps claim and suppresses automatic retry',t=>{
 const {root,run}=fixture(t); assert.notEqual(run({SEND_FAILURE:'22'}).status,0); assert.equal(run().status,0);
 assert.equal(readFileSync(join(root,'sends'),'utf8'),'sent\n');
});
