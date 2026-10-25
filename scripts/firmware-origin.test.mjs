import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOriginDetails, publicOriginDetails } from '../src/lib/firmware-origin.mjs';
const sha = 'a'.repeat(64), file = {filename:'vendor.exe',sha256:sha,md5:'b'.repeat(32),bytes:3};
const origin = () => ({category:'oem',originals:[{...file}],firmware:{...file,filename:'firmware.bin'}});
const catalog = (details) => ({identities:[{revisions:[{packages:[{filename:'firmware.tar',image_sha256:sha,origin_details:details}]}]}]});
test('only complete OEM provenance or explicitly approved dumps are published', () => {
  validateOriginDetails(catalog([origin()]));
  for (const category of ['omni','mk','dump',null]) {
    const d=origin();d.category=category;assert.throws(()=>validateOriginDetails(catalog([d])));
  }
  const dump=origin();dump.category='dump';dump.approval={allow_hoard:true,allow_publish:true};
  validateOriginDetails(catalog([dump]));
  for (const details of [undefined,[],[{...origin(),originals:[]}],[{...origin(),firmware:{...file,sha256:'c'.repeat(64)}}],[{...origin(),firmware:{...file,md5:null}}]]) assert.throws(()=>validateOriginDetails(catalog(details)));
});
test('Pioneer requires independent provenance for both Kernel and Normal', () => {
  const kernel=origin(),normal=origin();normal.firmware.sha256='c'.repeat(64);
  const data=catalog([kernel,normal]);const pkg=data.identities[0].revisions[0].packages[0];
  delete pkg.image_sha256;pkg.kernel_sha256=sha;pkg.normal_sha256='c'.repeat(64);
  validateOriginDetails(data);pkg.origin_details.pop();assert.throws(()=>validateOriginDetails(data));
});

test('Origin Details deduplicates shared originals and shows both extracted Pioneer files', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(new URL('../src/pages/firmware/find.astro', import.meta.url), 'utf8');
  const start = page.indexOf('function originDetails(p) {'), end = page.indexOf('function verificationBox', start);
  const render = new Function('escapeText', 'p', page.slice(start, end) + '; return originDetails(p);');
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const original={...file,filename:'vendor.exe'};
  const kernel={category:'oem',originals:[original],firmware:{...file,filename:'kernel.enc',role:'kernel'}};
  const normal={category:'oem',originals:[original],firmware:{...file,filename:'normal.enc',role:'normal'}};
  const html=render(escape,{origin:[kernel,normal]});
  assert.equal((html.match(/<strong>vendor.exe<\/strong>/g)||[]).length,1);
  assert.ok(html.includes('Kernel .enc'));assert.ok(html.includes('Normal .enc'));
  assert.equal((html.match(/<dt>MD5<\/dt>/g)||[]).length,3);
  const separate=render(escape,{origin:[kernel,{...normal,originals:[{...original,sha256:'d'.repeat(64),filename:'main.zip'}]}]});
  assert.ok(separate.includes('<h3>Original files</h3>'));
  assert.ok(separate.includes('<strong>main.zip</strong>'));
  assert.ok(separate.includes('Contains: Kernel .enc only'));
  assert.ok(!separate.includes('Other sources for these components'));
  const hostile=render(escape,{origin:[{...kernel,originals:[{...original,filename:'<img src=x onerror=alert(1)>'}]}]});
  assert.ok(!hostile.includes('<img'));assert.ok(hostile.includes('&lt;img'));
});


test('public Community provenance drops restoration prefixes without changing hashes or internal records', async () => {
  const {readFile} = await import('node:fs/promises');
  const data = JSON.parse(await readFile(new URL('../src/data/finder-catalog.json', import.meta.url), 'utf8'));
  const details = data.identities.flatMap(i=>i.revisions.flatMap(r=>r.packages.flatMap(p=>p.origin_details)));
  const affected = details.filter(d=>d.source_kind==='unmk-restored');
  assert.ok(affected.length > 0);
  for (const entry of affected) {
    const before = JSON.stringify(entry), output = publicOriginDetails([entry])[0];
    assert.doesNotMatch(JSON.stringify(output), /unmk/i);
    assert.equal(output.category,'dump');
    assert.equal(output.firmware.sha256,entry.firmware.sha256);
    assert.equal(output.firmware.md5,entry.firmware.md5);
    assert.equal(JSON.stringify(entry),before);
  }
  const entry={...origin(),category:'dump',source_kind:'unmk-restored',originals:[{...file,filename:'unMK_BU40N_1.03_64688690.bin',filenames:['unMK_BU40N_1.03_64688690.bin','BU40N_1.03_64688690.bin']}]};
  const output=publicOriginDetails([entry])[0];
  assert.equal(output.originals[0].filename,'BU40N_1.03_64688690.bin');
  assert.deepEqual(output.originals[0].filenames,['BU40N_1.03_64688690.bin']);
});
