import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync(new URL('../src/pages/firmware/find.astro', import.meta.url), 'utf8');
const start = page.indexOf('            function crossflashList() {');
const end = page.indexOf('\n            xf = crossflashList()', start);
function render(targets) {
  const context = { targets, versions: [{ r: '1.14' }], identities: [{}], ver: {},
    escapeText: s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    editionHtml: () => 'GENERAL', verificationBox: () => '' };
  vm.createContext(context);
  vm.runInContext(page.slice(start, end) + '\nresult = crossflashList();', context);
  return context.result;
}
test('available and conditional routes render once in one plain Cross Flash list', () => {
  const html = render([['BDR-UD04', 1, [[0, 0, 0], [0, 0, 0, 2, [[{ platform: 'UD02', prefix: 'BDR', suffix: 'TBD' }]]]]]]);
  assert.equal((html.match(/<h4 class="fx-h">Cross Flash<\/h4>/g) || []).length, 1);
  assert.equal((html.match(/>View<\/button>/g) || []).length, 1);
  assert.doesNotMatch(html, /Hardware check|Hardware Specific|Required hardware|UD02/);
});
test('conditional routes remain viewable without exposing internal hardware requirements', () => {
  const html = render([['BDR-UD04', 1, [[0, 0, 0, 2, [[{platform:'UD02',prefix:null,suffix:null}]]]]]]);
  assert.match(html, /Cross Flash/);
  assert.match(html, />View<\/button>/);
  assert.doesNotMatch(html, /hardware|UD02/i);
});
test('legacy conditional routes without hardware evidence remain unoffered', () => {
  assert.equal(render([['BDR-UD04', 1, [[0, 0, 0, 2]]]]), '');
});
