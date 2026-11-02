import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync(new URL('../src/pages/firmware/find.astro', import.meta.url), 'utf8');
const start = page.indexOf('            function crossflashGroup(hardware) {');
const end = page.indexOf('\n            xf = crossflashGroup(false)', start);
function render(targets) {
  const context = { targets, versions: [{ r: '1.14' }], identities: [{}], ver: {},
    escapeText: s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    editionHtml: () => 'GENERAL', verificationBox: () => '' };
  vm.createContext(context);
  vm.runInContext(page.slice(start, end) + '\nresult = crossflashGroup(false) + crossflashGroup(true);', context);
  return context.result;
}
test('finder renders two groups and states required hardware before viewing', () => {
  const html = render([['BDR-UD04', 1, [[0, 0, 0], [0, 0, 0, 2, [[{ platform: 'UD02', prefix: 'BDR', suffix: 'TBD' }]]]]]]);
  assert.match(html, /<h4 class="fx-h">Cross Flash<\/h4>/);
  assert.match(html, /<h4 class="fx-h">Hardware Specific Cross Flash<\/h4>/);
  assert.match(html, /Required hardware: BDR-UD02TBD<\/span><button/);
  assert.doesNotMatch(html, /Hardware check/);
});
test('legacy conditional routes without hardware evidence are not offered as normal flashes', () => {
  assert.equal(render([['BDR-UD04', 1, [[0, 0, 0, 2]]]]), '');
});
test('hardware requirement text is escaped', () => {
  assert.match(render([['BDR-UD04', 1, [[0, 0, 0, 2, [[{platform: '<hardware>', prefix: null, suffix: null}]]]]]]), /&lt;hardware>/);
});
