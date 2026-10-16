import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCrossflashLinks } from './firmware-release.mjs';

const catalog = { identities: [{ revisions: [{ packages: [{ sha256: 'a' }, { sha256: 'b' }, { sha256: 'c' }] }] }] };
const graph = () => ({ format: 'freemkv-crossflash-links', version: 2, links: { a: ['b'] }, future: { a: ['c'] } });
test('crossflash schema accepts legacy and classified graphs', () => {
  assert.doesNotThrow(() => checkCrossflashLinks(graph(), catalog));
  assert.doesNotThrow(() => checkCrossflashLinks({ format: 'freemkv-crossflash-links', version: 1, links: { a: ['b'] } }, catalog));
});
test('crossflash schema validates both graphs, target arrays and disjoint pairs', () => {
  for (const patch of [{ future: null }, { links: [] }, { future: { a: 'c' } }, { future: { a: ['missing'] } }, { future: { missing: ['b'] } }, { future: { a: ['b'] } }, { version: 1, future: { a: ['missing'] } }]) {
    assert.throws(() => checkCrossflashLinks({ ...graph(), ...patch }, catalog));
  }
});
