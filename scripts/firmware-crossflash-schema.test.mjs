import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCrossflashLinks } from './firmware-release.mjs';
import { validateCrossflashCoverage } from '../src/lib/finder.mjs';
import { readFileSync } from 'node:fs';

const catalog = { identities: [{ revisions: [{ packages: [{ sha256: 'a' }, { sha256: 'b' }, { sha256: 'c' }] }] }] };
const graph = () => ({ format: 'freemkv-crossflash-links', version: 2, links: { a: ['b'] }, future: { a: ['c'] } });
test('a replacement package invalidates graph coverage even when all retained edges are valid', () => {
  const evaluated = { ...graph(), evaluated_packages: ['a', 'b', 'c'] };
  assert.doesNotThrow(() => validateCrossflashCoverage(catalog, evaluated));
  const replaced = { identities: [{ revisions: [{ packages: [{ sha256: 'a' }, { sha256: 'b' }, { sha256: 'replacement' }] }] }] };
  const filtered = { ...evaluated, future: {} };
  assert.throws(() => checkCrossflashLinks(filtered, replaced), /does not cover/);
  assert.throws(() => validateCrossflashCoverage(catalog, graph()), /does not cover/);
  assert.throws(() => validateCrossflashCoverage(catalog, { evaluated_packages: ['a', 'b', 'b'] }), /does not cover/);
});
test('published graph covers every package and every corrected replacement', () => {
  const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
  const catalog = read('../src/data/finder-catalog.json');
  const graph = read('../src/data/crossflash-links.json');
  validateCrossflashCoverage(catalog, graph);
  checkCrossflashLinks(graph, catalog);
  for (const replacement of read('./td05-replacement.json').replacements) {
    assert.ok(graph.evaluated_packages.includes(replacement.replacement_sha256));
    assert.ok(!JSON.stringify(graph).includes(replacement.bad_package_sha256));
  }
  const ud03 = '18b57472eeac46db8437ab4e3745035d463ee39b5fdca2f56b00a0959d049d84';
  const ud04 = '349da8b41479735437872a898556c9bc9ddca135ddac0ef90a0684949f96dfb6';
  assert.ok(graph.links[ud03]?.includes(ud04), 'corrected UD03 1.03 must retain its flasher-admitted UD04 route');
});
test('crossflash schema accepts legacy and classified graphs', () => {
  assert.doesNotThrow(() => checkCrossflashLinks(graph(), catalog));
  assert.doesNotThrow(() => checkCrossflashLinks({ format: 'freemkv-crossflash-links', version: 1, links: { a: ['b'] } }, catalog));
});
test('crossflash schema validates both graphs, target arrays and disjoint pairs', () => {
  for (const patch of [{ future: null }, { links: [] }, { future: { a: 'c' } }, { future: { a: ['missing'] } }, { future: { missing: ['b'] } }, { future: { a: ['b'] } }, { version: 1, future: { a: ['missing'] } }]) {
    assert.throws(() => checkCrossflashLinks({ ...graph(), ...patch }, catalog));
  }
});
