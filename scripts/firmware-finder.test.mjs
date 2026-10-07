import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFinderData, finderPageData, hostedSummary, compareRevision, destinationLabel, editionLabel, crossflashTargets } from '../src/lib/finder.mjs';
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
  const shown = [...d.models.flatMap(m => [m.m, ...m.v.map(v => v[1])]), ...d.identities.flatMap(i => [i.n, i.brand, i.d]),
    ...d.packages.flatMap(p => p.chips.map(c => c[0]).filter(c => c !== 'Destination GENERAL'))];
  // "GENERAL" is a Pioneer edition name ("1.53 GENERAL · SAT 8800"); nothing else raw.
  for (const s of shown) assert.doesNotMatch(String(s).replace(/ GENERAL · /, ' '), /\?|GENERAL|makemkv/i, s);
  // One model sold in several editions: OEM where known, else just the version.
  const bu40 = d.models.find(m => m.m === 'BU40N').v.map(v => v[1]);
  for (const l of ['BU12 (Buffalo)', 'BW42 (HP)', 'BN12', 'U100']) assert.ok(bu40.includes(l), l);
});

test('versions are labelled by revision plus edition (Pioneer: and SAT on every row)', () => {
  const d = page();
  assert.deepEqual(labels(d, 'BDR-XD07'), ['1.10 ID35 · SAT 8D30', '1.10 ID36 · SAT 8D30']);
  assert.deepEqual(labels(d, 'BDR-S13U'), ['1.05 ID43 · SAT 9201', '1.02 ID43 · SAT 9201']);
  assert.deepEqual(labels(d, 'BU40N'), ['1.00']);
  assert.equal(destinationLabel({ family: 'mediatek', destination: 'R?' }), '');
  assert.equal(destinationLabel({ family: 'mediatek', destination: 'BUFFALO' }), 'Buffalo');
  assert.equal(destinationLabel({ family: 'pioneer', destination: 'GENERAL' }), '');
  assert.equal(editionLabel({ family: 'pioneer', destination: 'GENERAL' }), 'GENERAL');
  assert.equal(editionLabel({ family: 'pioneer', destination: 'ID58' }), 'ID58');
  assert.equal(editionLabel({ family: 'pioneer', destination: 'MEDION2' }), 'Medion');
  assert.equal(editionLabel({ family: 'mediatek', destination: 'GENERAL' }), '');
});

test('one version per revision; the kernel-bearing package is preferred and the other stays downloadable', () => {
  const d = page();
  const v = d.versions.find(x => x.r === '1.05' && d.identities[x.i].n === 'BDR-S13U');
  assert.deepEqual(v.p.map(p => d.packages[p].s), [SHA.s13u105k, SHA.s13u105n]);
  assert.deepEqual(v.p.map(p => d.packages[p].contents), ['Kernel 1.00 + Normal', 'Normal']);
  // SAT and edition are a heading and row text, not pills.
  assert.deepEqual(d.packages[v.p[0]].chips.map(c => c[0]), ['Pioneer', 'Kernel + Normal']);
  assert.equal(d.identities[v.i].h, 'SAT 9201');
  assert.equal(d.identities[v.i].e, 'ID43');
});

test('MediaTek keeps feature data from the old index; no provenance', () => {
  const d = page();
  const v = d.versions[model(d, 'BU40N').v[0][0]];
  assert.equal(v.mod, 1);
  assert.deepEqual(v.features, [{ name: 'Region-free', ok: true }]);
  assert.ok(d.packages[v.p[0]].chips.some(c => c[0] === 'Hardware-verified'));
  // Users get downloads, never provenance.
  assert.ok(d.packages.every(p => !('src' in p)));
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

test('S12JX package pills agree with cross-flash completeness for each selected revision', () => {
  const catalog = JSON.parse(readFileSync(new URL('../src/data/finder-catalog.json', import.meta.url)));
  const d = finderPageData(buildFinderData({ catalog }));
  const s12 = d.identities.find(i => i.n === 'BDR-S12JX');
  const source = d.identities.find(i => i.n === 'BDR-212D');
  const target = source.x.find(([name]) => name === 'BDR-S12JX');
  assert.ok(target);
  // 1.01-1.03 are Pioneer Normal-only releases chained to the factory Kernel 1.00.
  for (const [revision, complete] of [['1.05', true], ['1.03', true], ['1.02', true], ['1.01', true]]) {
    const vi = s12.v.find(v => d.versions[v].r === revision);
    const pkg = d.packages[d.versions[vi].p[0]];
    const labels = pkg.chips.map(c => c[0]);
    assert.ok(labels.includes(complete ? 'Kernel + Normal' : 'Normal'), revision);
    assert.equal(labels.includes('Kernel + Normal'), complete, revision);
    assert.ok(labels.includes('UHD capable'));
    assert.equal(s12.e, 'ID72');
    assert.ok(!labels.some(l => /^ID/.test(l) || /^Hardware /.test(l)));
    assert.equal(target[2].find(([, v]) => v === vi)[2], complete ? 0 : 1);
  }
  const normal = d.packages[d.versions[source.v[0]].p[0]];
  assert.ok(!normal.chips.some(c => c[0] === 'UHD capable'));
});

test('alternate downloads have their own component pills instead of inheriting the preferred package', () => {
  const d = page();
  const v = d.versions.find(x => x.r === '1.05' && d.identities[x.i].n === 'BDR-S13U');
  assert.ok(d.packages[v.p[0]].chips.some(c => c[0] === 'Kernel + Normal'));
  assert.ok(d.packages[v.p[1]].chips.some(c => c[0] === 'Normal'));
  assert.ok(!d.packages[v.p[1]].chips.some(c => c[0] === 'Kernel + Normal'));
});

test('every Pioneer package shows its own contents and catalogued UHD capability; SAT and edition live on the identity', () => {
  const catalog = JSON.parse(readFileSync(new URL('../src/data/finder-catalog.json', import.meta.url)));
  const d = finderPageData(buildFinderData({ catalog }));
  const bySha = new Map(d.packages.map(p => [p.s, p]));
  for (const i of catalog.identities.filter(i => i.family === 'pioneer')) {
    for (const r of i.revisions) for (const p of r.packages) {
      const labels = bySha.get(p.sha256).chips.map(c => c[0]);
      const roles = p.components.map(c => c.role);
      const componentLabel = [roles.includes('kernel') && 'Kernel', roles.includes('normal') && 'Normal'].filter(Boolean).join(' + ');
      if (componentLabel) assert.ok(labels.includes(componentLabel), p.filename);
      assert.equal(labels.includes('Kernel + Normal'), roles.includes('kernel') && roles.includes('normal'), p.filename);
      const ident = d.identities.find(x => x.v.some(v => d.versions[v].p.some(pi => d.packages[pi].s === p.sha256)));
      assert.equal(ident.e, editionLabel(i), p.filename);
      assert.equal(ident.h, /^[0-9A-F]{4}$/.test(i.hardware) ? 'SAT ' + i.hardware : i.hardware, p.filename);
      assert.ok(!labels.some(l => l === ident.e || /^Hardware |^Destination /.test(l)), p.filename);
      assert.equal(labels.includes('UHD capable'), p.is_uhd === true, p.filename);
    }
  }
});

test('UHD capability is attached to the selected package, not inherited from another revision', () => {
  const cat = catalog();
  const identity = cat.identities.find(i => i.embedded_models.includes('BDR-S13U'));
  for (const r of identity.revisions) for (const p of r.packages) p.is_uhd = r.revision === '1.05';
  const d = finderPageData(buildFinderData({ catalog: cat }));
  const i = d.identities.find(i => i.n === 'BDR-S13U');
  for (const vi of i.v) {
    const v = d.versions[vi];
    assert.equal(d.packages[v.p[0]].chips.some(c => c[0] === 'UHD capable'), v.r === '1.05');
  }
});

test('all published cross-flash rows agree with the package their View button opens', () => {
  const catalog = JSON.parse(readFileSync(new URL('../src/data/finder-catalog.json', import.meta.url)));
  const d = finderPageData(buildFinderData({ catalog }));
  for (const i of d.identities) for (const [name, , rows] of i.x) {
    for (const [, vi, incomplete] of rows) {
      const v = d.versions[vi], p = d.packages[v.p[0]];
      assert.equal(p.chips.some(c => c[0] === 'Kernel + Normal'), !incomplete, `${i.n} → ${name} ${v.r}`);
    }
  }
});

const realPage = () => finderPageData(buildFinderData({ catalog: JSON.parse(readFileSync(new URL('../src/data/finder-catalog.json', import.meta.url))) }));
const rowOf = (d, m, n) => { const v = d.versions[m.v[n][0]]; return { r: v.r, ...d.identities[v.i] }; };

test('a model on two SATs: every row carries its SAT and edition, duplicates all labelled', () => {
  const d = realPage();
  const m = d.models.find(x => x.m === 'BDR-211M');
  assert.deepEqual([...new Set(m.v.map((_, n) => rowOf(d, m, n).h))].sort(), ['SAT 8800', 'SAT 8801']);
  const ls = m.v.map(v => v[1]);
  for (const l of ['1.54 ID58 · SAT 8800', '1.54 ID58 · SAT 8801', '1.53 GENERAL · SAT 8800', '1.53 GENERAL · SAT 8801']) assert.ok(ls.includes(l), l);
  assert.equal(new Set(ls).size, ls.length);
});

test('default pick: newest revision, a real ID over GENERAL, then the higher SAT', () => {
  const d = realPage();
  const pick = name => { const m = d.models.find(x => x.m === name); const r = rowOf(d, m, m.o[0]); return [r.r, r.e, r.h]; };
  assert.deepEqual(pick('BDR-211M'), ['1.54', 'ID58', 'SAT 8801']);
  assert.deepEqual(pick('BDR-212M'), ['1.05', 'ID56', 'SAT 8F00']);
  assert.deepEqual(pick('BDR-S12JX'), ['1.05', 'ID72', 'SAT 8F01']);
});

test('cross flash: same family members only, headed by the drive-reported name, alphabetical', () => {
  const catalog = JSON.parse(readFileSync(new URL('../src/data/finder-catalog.json', import.meta.url)));
  const data = buildFinderData({ catalog });
  const d = finderPageData(data);
  for (const [n, i] of data.identities.entries()) {
    const expected = crossflashTargets(data, i).map(t => t.identity.key).sort();
    const listed = [...new Set(d.identities[n].x.flatMap(([, , rows]) => rows.map(([t]) => data.identities[t].key)))].sort();
    assert.deepEqual(listed, expected, i.key);
    const heads = d.identities[n].x.map(([name]) => name);
    assert.deepEqual(heads, [...heads].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), i.key);
  }
  // Every BDR-211M edition on SAT 8800 lists under "BDR-211M" from the S11J-X, never the 8801 board.
  const s11jx = d.identities[data.identities.findIndex(i => i.key === 'pioneer:8800:ID72')];
  const m211 = s11jx.x.find(([name]) => name === 'BDR-211M');
  assert.ok(m211);
  assert.deepEqual([...new Set(m211[2].map(([t]) => data.identities[t].key))].sort(),
    ['pioneer:8800:GENERAL', 'pioneer:8800:ID58', 'pioneer:8800:ID60']);
  const heads = s11jx.x.map(([name]) => name);
  assert.equal(heads.indexOf('BDR-S11') - heads.indexOf('BDR-S09JX'), 1);
});
