import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync(new URL('../src/pages/firmware/find.astro', import.meta.url), 'utf8');
const start = page.indexOf('            function crossflashList(hardware) {');
const end = page.indexOf('\n            xf = crossflashList(false)', start);
function render(targets) {
  const context = { targets, versions: [{ r: '1.14' }], identities: [{}], ver: {},
    escapeText: s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    editionHtml: () => 'GENERAL', verificationBox: () => '' };
  vm.createContext(context);
  vm.runInContext(page.slice(start, end) + '\nresult = crossflashList(false) + crossflashList(true);', context);
  return context.result;
}
test('normal route suppresses its duplicate hardware return route', () => {
  const html = render([['BDR-UD04', 1, [[0, 0, 0], [0, 0, 0, 2, [[{ platform: 'UD02', prefix: 'BDR', suffix: 'TBD' }]]]]]]);
  assert.equal((html.match(/<h4 class="fx-h">Cross Flash<\/h4>/g) || []).length, 1);
  assert.equal((html.match(/>View<\/button>/g) || []).length, 1);
  assert.doesNotMatch(html, /Hardware check|Hardware Cross Flash|Hardware Specific|Required hardware|UD02/);
});
test('hardware-only return routes have a plain Hardware Cross Flash heading', () => {
  const html = render([['BDR-UD04', 1, [[0, 0, 0, 2, [[{platform:'UD02',prefix:null,suffix:null}]]]]]]);
  assert.match(html, /Hardware Cross Flash/);
  assert.match(html, />View<\/button>/);
  assert.doesNotMatch(html, /Required hardware|Hardware check|UD02/);
});
test('legacy conditional routes without hardware evidence remain unoffered', () => {
  assert.equal(render([['BDR-UD04', 1, [[0, 0, 0, 2]]]]), '');
});

test('distinct normal and hardware return targets appear under their two plain headings', () => {
  const html = render([
    ['BDR-UD04', 1, [[0, 0, 0]]],
    ['BDR-UD03', 0, [[1, 0, 0, 2, [[{platform:'UD02',prefix:null,suffix:null}]]]]],
  ]);
  assert.match(html, /<h4 class="fx-h">Cross Flash<\/h4>/);
  assert.match(html, /<h4 class="fx-h">Hardware Cross Flash<\/h4>/);
  assert.equal((html.match(/>View<\/button>/g) || []).length, 2);
  assert.doesNotMatch(html, /Required hardware|Hardware check|Hardware Specific/);
});
