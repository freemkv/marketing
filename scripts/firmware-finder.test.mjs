import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFinderData, finderPageData, hostedSummary, compareRevision, destinationLabel, sourceNote } from '../src/lib/finder.mjs';
import { catalog, mediatek, pioneer, SHA, V1_ONLY_SHA, MTK_ONLY_SHA } from './fixtures/finder-catalog.mjs';

const data = () => buildFinderData({ catalog: catalog(), mediatek: mediatek() });
const page = (opts = {}) => finderPageData(data(), { legacy: [...mediatek(), ...pioneer()], ...opts });
const model = (d, name) => d.models.find(m => m.m === name);
const labels = (d, name) => model(d, name).v.map(v => v[1]);

test('every catalogue package is reachable from a listed model name', () => {
  const d = page();
  const reachable = new Set(d.models.flatMap(m => m.v.flatMap(([v]) => d.versions[v].p.map(p => d.packages[p].s))));
  const all = data().identities.flatMap(i => i.revisions.flatMap(r => r.packages.map(p => p.sha256)));
  assert.equal(reachable.size, all.length);
  assert.ok(reachable.has(MTK_ONLY_SHA));
  assert.equal(hostedSummary(data()).total, all.length);
});

test('the real catalogue: all packages reachable, old model names listed, no raw labels', () => {
  const rd = f => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url)));
  const mtk = rd('firmware-index.json'), pio = rd('pioneer-firmware-index.json');
  const built = buildFinderData({ catalog: rd('finder-catalog.json'), mediatek: mtk });
  const d = finderPageData(built, { legacy: [...mtk, ...pio] });
  const total = built.identities.reduce((n, i) => n + i.revisions.reduce((m, r) => m + r.packages.length, 0), 0);
  assert.equal(new Set(d.models.flatMap(m => m.v.flatMap(([v]) => d.versions[v].p))).size, total);
  const names = new Set(d.models.map(m => m.m.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  for (const row of [...mtk, ...pio]) assert.ok(names.has(row.model.toUpperCase().replace(/[^A-Z0-9]/g, '')), row.model);
  const shown = [...d.models.flatMap(m => [m.m, ...m.v.map(v => v[1])]), ...d.identities.flatMap(i => [i.n, i.brand, i.d, ...i.chips.map(c => c[0])]),
    ...d.packages.map(p => p.src)];
  for (const s of shown) assert.doesNotMatch(String(s), /\?|GENERAL|makemkv/i, s);
  // One model sold in several editions: OEM where known, else just the version.
  const bu40 = d.models.find(m => m.m === 'BU40N').v.map(v => v[1]);
  for (const l of ['BU12 (Buffalo)', 'BW42 (HP)', 'BN12', 'U100']) assert.ok(bu40.includes(l), l);
});

test('versions are labelled by revision plus OEM/ID only', () => {
  const d = page();
  assert.deepEqual(labels(d, 'BDR-XD07'), ['1.10 (ID35)', '1.10 (ID36)']);
  assert.deepEqual(labels(d, 'BDR-S13U'), ['1.05 (ID43)', '1.02 (ID43)']);
  assert.deepEqual(labels(d, 'BU40N'), ['1.00']);
  assert.equal(destinationLabel({ family: 'mediatek', destination: 'R?' }), '');
  assert.equal(destinationLabel({ family: 'mediatek', destination: 'BUFFALO' }), 'Buffalo');
  assert.equal(destinationLabel({ family: 'pioneer', destination: 'GENERAL' }), '');
});

test('one version per revision; the kernel-bearing package is preferred and the other stays downloadable', () => {
  const d = page();
  const v = d.versions.find(x => x.r === '1.05' && d.identities[x.i].n === 'BDR-S13U');
  assert.deepEqual(v.p.map(p => d.packages[p].s), [SHA.s13u105k, SHA.s13u105n]);
  assert.deepEqual(v.p.map(p => d.packages[p].contents), ['Kernel 1.00 + Normal', 'Normal']);
  assert.deepEqual(d.identities[v.i].chips.map(c => c[0]), ['Pioneer', 'Hardware SAT 9201', 'ID ID43', 'Kernel + Normal']);
});

test('MediaTek keeps feature data from the old index; source notes are human', () => {
  const d = page();
  const v = d.versions[model(d, 'BU40N').v[0][0]];
  assert.equal(v.mod, 1);
  assert.deepEqual(v.features, [{ name: 'Region-free', ok: true }]);
  assert.ok(d.identities[v.i].chips.some(c => c[0] === 'Hardware-verified'));
  const i = { family: 'pioneer', hardware: '8A10' };
  assert.equal(sourceNote(i, { provenance: 'Source BDR-UD04_1.14.reconstructed.tar' }), 'Rebuilt from a drive dump');
  assert.equal(sourceNote(i, { provenance: 'Source BDR-UD04_FW111.exe' }), 'Pioneer download BDR-UD04_FW111.exe');
  assert.equal(sourceNote(i, { provenance: 'FirmwareHQ mirror X.exe (captured 2026-09-25)' }), 'FirmwareHQ mirror X.exe');
});

test('object keys ship only for public builds; v1-only Pioneer rows add no packages', () => {
  assert.ok(page().packages.every(p => p.k));
  assert.ok(page({ keys: false }).packages.every(p => !('k' in p)));
  assert.ok(!page().packages.some(p => p.s === V1_ONLY_SHA));
});

test('revision ordering is numeric and ignores region suffixes', () => {
  assert.ok(compareRevision('1.10', '1.02') > 0);
  assert.equal(compareRevision('1.02EU', '1.02'), 0);
});
