import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFinderData, finderPageData, hostedSummary, compareRevision, destinationLabel, editionLabel, crossflashTargets } from '../src/lib/finder.mjs';
import { catalog, mediatek, pioneer, SHA, V1_ONLY_SHA, MTK_ONLY_SHA, mediatekFamilyCatalog, mediatekFamilyLinks } from './fixtures/finder-catalog.mjs';

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

test('the real catalogue: all packages reachable, old model names searchable, no raw labels', () => {
  const rd = f => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url)));
  const mtk = rd('firmware-index.json'), pio = rd('pioneer-firmware-index.json');
  const built = buildFinderData({ catalog: rd('finder-catalog.json'), mediatek: mtk });
  const d = finderPageData(built, { legacy: [...mtk, ...pio] });
  const total = built.identities.reduce((n, i) => n + i.revisions.reduce((m, r) => m + r.packages.length, 0), 0);
  assert.equal(new Set(d.models.flatMap(m => m.v.flatMap(([v]) => d.versions[v].p))).size, total);
  const names = new Set(d.models.map(m => m.m.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  const searchable = d.models.map(m => m.t).join(' ');
  for (const row of pio) assert.ok(names.has(row.model.toUpperCase().replace(/[^A-Z0-9]/g, '')) || searchable.includes(row.model.toLowerCase().replace(/[^a-z0-9]/g, '')), row.model);
  for (const name of ['BDR-206PA','BDR-206PB']) {
    const row=d.models.find(m=>m.m===name);assert.ok(row);assert.ok(row.t.includes('epson'));assert.ok(row.t.includes('pp100'));
    assert.ok(!d.models.some(m=>m.m==='Epson '+name));
  }
  assert.ok(!d.models.some(m=>m.m==='PP100'||m.m==='PP-100'));
  assert.equal(d.identities.find(i=>i.key==='pioneer:1030:ID20').n,'BDR-206PA');
  // Embedded MediaTek names can be truncated; catalogue names retain the updater identity.
  const images = new Set(rd('finder-catalog.json').identities.filter(i => i.family === 'mediatek')
    .flatMap(i => i.revisions.flatMap(r => r.packages.map(p => p.image_sha256 ?? p.sha256))));
  for (const row of mtk) for (const version of row.versions) assert.ok(images.has(version.sha256), row.model);
  const shown = [...d.models.flatMap(m => [m.m, ...m.v.map(v => v[1])]), ...d.identities.flatMap(i => [i.n, i.brand, i.d]),
    ...d.packages.flatMap(p => p.chips.map(c => c[0]).filter(c => c !== 'Destination GENERAL'))];
  // "GENERAL" is a Pioneer edition name ("1.53 GENERAL · SAT 8800"); nothing else raw.
  for (const s of shown) assert.doesNotMatch(String(s).replace(/ GENERAL · /, ' '), /\?|GENERAL|makemkv/i, s);
  // One model sold in several editions: OEM where known, else just the version.
  const bu40 = d.models.find(m => m.m === 'BU40N').v.map(v => v[1]);
  for (const l of ['BU12 (Buffalo)', 'BW42 (HP)', 'BN12', 'U101']) assert.ok(bu40.includes(l), l);
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
  const d = finderPageData(realData());
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
  const d = finderPageData(realData());
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
  // Available and Future rows carry the matching graph classification.
  const data = realData(), d = finderPageData(data);
  for (const [n, i] of d.identities.entries()) {
    const linked = new Set(data.identities[n].revisions.flatMap(r => r.packages.flatMap(p => data.crossflash[p.sha256] ?? [])));
    const future = new Set(data.identities[n].revisions.flatMap(r => r.packages.flatMap(p => data.crossflashFuture[p.sha256] ?? [])));
    for (const [name, , rows] of i.x) for (const [t, vi, incomplete, pending] of rows) {
      const v = d.versions[vi];
      const available = v.p.some(p => linked.has(d.packages[p].s));
      const waiting = !available && v.p.some(p => future.has(d.packages[p].s));
      assert.equal(available || waiting, !incomplete, `${i.n} → ${name} ${v.r}`);
      assert.equal(Boolean(pending), waiting, `${i.n} → ${name} ${v.r} Future`);
      // "Incomplete - missing kernel" is Pioneer-only and only for a revision without Kernel + Normal.
      if (incomplete) {
        assert.equal(d.identities[t].pio, 1, `${i.n} → ${name} ${v.r}`);
        assert.ok(!v.p.some(p => d.packages[p].chips.some(c => c[0] === 'Kernel + Normal')), `${i.n} → ${name} ${v.r}`);
      }
    }
  }
});

const realPage = () => finderPageData(realData());
const realData = () => buildFinderData({
  catalog: JSON.parse(readFileSync(new URL('../src/data/finder-catalog.json', import.meta.url))),
  crossflash: JSON.parse(readFileSync(new URL('../src/data/crossflash-links.json', import.meta.url))),
});
const publishedPage = () => {
  const rd = f => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url)));
  const mtk = rd('firmware-index.json'), pio = rd('pioneer-firmware-index.json');
  return finderPageData(buildFinderData({ catalog: rd('finder-catalog.json'), mediatek: mtk }), { legacy: [...mtk, ...pio] });
};
const rowOf = (d, m, n) => { const v = d.versions[m.v[n][0]]; return { r: v.r, ...d.identities[v.i] }; };

test('a model on two SATs: every row carries its SAT and edition, duplicates all labelled', () => {
  const d = realPage();
  const m = d.models.find(x => x.m === 'BDR-211M');
  assert.deepEqual([...new Set(m.v.map((_, n) => rowOf(d, m, n).h))].sort(), ['SAT 8800', 'SAT 8801']);
  const ls = m.v.map(v => v[1]);
  for (const l of ['1.54 ID58 · SAT 8800', '1.54 ID58 · SAT 8801', '1.53 GENERAL · SAT 8800', '1.53 GENERAL · SAT 8801']) assert.ok(ls.includes(l), l);
  assert.equal(new Set(ls).size, ls.length);
});

test('default pick: first SAT, its newest revision, a real ID over GENERAL', () => {
  const d = realPage();
  const pick = name => { const m = d.models.find(x => x.m === name); const r = rowOf(d, m, m.o[0]); return [r.r, r.e, r.h]; };
  assert.deepEqual(pick('BDR-211M'), ['1.54', 'ID58', 'SAT 8800']);
  assert.deepEqual(pick('BDR-S11JX'), ['1.54', 'ID72', 'SAT 8800']);
  assert.deepEqual(pick('BDR-212M'), ['1.05', 'ID56', 'SAT 8F00']);
  assert.deepEqual(pick('BDR-S12JX'), ['1.05', 'ID72', 'SAT 8F01']);
});

test('default pick prefers the newest supported named edition over an unmodifiable other edition', () => {
  const d = publishedPage();
  const m = d.models.find(x => x.m === 'BU40N');
  const v = d.versions[m.v[m.o[0]][0]];
  const i = d.identities[v.i];
  assert.equal(v.r, '1.05');
  assert.equal(v.mod, 1);
  assert.equal(i.brand, 'LG');
  assert.notEqual(i.g, 'Other editions');
});

test('cross flash: freemkv-flash link targets only, headed by the drive-reported name, alphabetical', () => {
  const data = realData();
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

test('"Also sold as": retail box names per edition, split, without bare numbers or other brands', () => {
  const d = realPage();
  const aka = name => d.models.find(x => x.m === name).a;
  assert.deepEqual(aka('BDR-211M'), [['GENERAL', ['BDR-211XJ']], ['ID58', ['BDR-211JBK']], ['ID60', ['BDR-211EBK', 'BDR-211UBK']]]);
  assert.deepEqual(aka('BDR-212M'), [['GENERAL', ['BDR-212XJ']], ['ID56', ['BDR-212EBK', 'BDR-212UBK', 'BDR-212ULBK']]]);
  assert.equal(aka('BDR-S11JX'), undefined);
  for (const m of d.models) for (const [, names] of m.a ?? []) for (const n of names) assert.doesNotMatch(n, /_|BWU|\s/, m.m);
});

test('MediaTek page data: linked models list each other; unlinked models do not', () => {
  const d = finderPageData(buildFinderData({ catalog: mediatekFamilyCatalog(), crossflash: mediatekFamilyLinks() }));
  const by = n => d.identities.findIndex(i => i.n === n);
  const view = n => d.identities[by(n)].x.map(([name, u, rows]) => [name, u, rows.map(([t, v, inc]) => [d.identities[t].n, d.versions[v].r, inc])]);
  // Two same-family MediaTek models list each other; the single full image is complete (inc 0).
  assert.deepEqual(view('BU40N'), [['WH16NS60', 0, [['WH16NS60', '1.03', 0]]]]);
  assert.deepEqual(view('WH16NS60'), [['BU40N', 0, [['BU40N', '1.00', 0]]]]);
  // A different family and a package without family_id produce no cross-flash rows.
  assert.deepEqual(d.identities[by('BW-16D1HT')].x, []);
  assert.deepEqual(d.identities[by('BH16NS55')].x, []);
  // These are MediaTek identities, not Pioneer.
  assert.equal(d.identities[by('BU40N')].pio, 0);
});

test('MediaTek release packages replace legacy bins and inherit final image features', () => {
  const imageSha = '1'.repeat(64), packageSha = '2'.repeat(64);
  const c = { format: 'freemkv-finder-catalog', version: 2,
    mediatek_package_format: 'freemkv-mediatek-package', aliases: [], identities: [{
      key: 'mediatek:WH16NS58:GENERAL', family: 'mediatek', hardware: 'WH16NS58', platforms: ['MT1959'],
      revisions: [{ revision: '1.V9', packages: [{ sha256: packageSha, image_sha256: imageSha,
        key: `fw/mediatek/${packageSha}.tar`, filename: 'WH16NS58_1.V9.tar', bytes: 4200000,
        packageType: 'mediatek-installer' }] }],
    }] };
  const legacy = [{ model: 'WH16NS58', versions: [{ rev: '1.V9', sha256: imageSha, file: 'old.bin', modifiable: true }] },
    { model: 'BH16NS40', versions: [{ rev: 'INTM', sha256: '3'.repeat(64), file: 'intm.bin' }] }];
  const built = buildFinderData({ catalog: c, mediatek: legacy });
  const packages = built.identities.flatMap(i => i.revisions.flatMap(r => r.packages));
  assert.equal(packages.length, 1);
  assert.equal(packages[0].sha256, packageSha);
  assert.equal(packages[0].modifiable, true);
  assert.ok(packages[0].filename.endsWith('.tar'));
});

test('published BDR-205 to BDR-206 candidates carry Future instead of an available transfer', () => {
  const page = realPage();
  const installed = page.identities.find(i => i.n === 'BDR-205' && i.e === 'ID43');
  const target = installed.x.find(([name]) => name === 'BDR-206');
  assert.ok(target, 'known handoff mismatch stays discoverable');
  const rows = target[2].filter(([t]) => page.identities[t].e === 'ID43');
  assert.ok(rows.length > 0);
  for (const row of rows) assert.deepEqual(row.slice(2), [0, 1], 'Future candidate is complete and requires an intermediate transfer');
});


test('Pioneer servo families keep PR1EPDV out of the SAT 8000 crossflash search', () => {
  const data = realData();
  const epson = data.identities.find(i => i.key === 'pioneer:8680:ID79');
  const bdr207 = data.identities.find(i => i.key === 'pioneer:8000:ID60');
  assert.ok(epson, 'published PR1EPDV identity');
  assert.ok(bdr207, 'published BDR-207M identity');
  assert.ok(epson.revisions.some(r => r.revision === '1.01'));
  assert.ok(bdr207.revisions.some(r => r.revision === '1.60'));
  assert.ok(!crossflashTargets(data, epson).some(t => t.identity.hardware === '8000'));
  assert.ok(!crossflashTargets(data, bdr207).some(t => t.identity.key === epson.key));
});

test('compressed S08 servo data restores S11JX SAT 8800 compatibility without admitting SAT 8801', () => {
  const data = realData();
  const s08 = data.identities.find(i => i.key === 'pioneer:8301:ID43');
  assert.ok(s08, 'published BDR-S08 identity');
  const targets = crossflashTargets(data, s08).map(t => t.identity.key);
  assert.ok(targets.includes('pioneer:8800:ID72'), 'S11JX SAT 8800 is available');
  assert.ok(!targets.includes('pioneer:8801:ID72'), 'different SAT 8801 hardware remains excluded');
});

 test('finder sends only available modification pills and omits an empty feature group', () => {
  const built = data();
  const pkg = built.identities.find(i => i.family === 'mediatek').revisions[0].packages[0];
  pkg.modifiable = true;
  pkg.features = [{ name: 'Speed', ok: true }, { name: 'UHD', ok: false }, { name: 'BD', ok: false }];
  const version = page => page.versions.find(v => v.p.some(p => page.packages[p].s === pkg.sha256));
  assert.deepEqual(version(finderPageData(built)).features, [{ name: 'Speed', ok: true }]);
  pkg.features = [{ name: 'UHD', ok: false }];
  assert.equal('features' in version(finderPageData(built)), false);
 });
