import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinderData, indexFinder, search, parseDriveString, pickerOptions, identityView, routeFromUrl, urlFor,
  suggestions, browseTree, clientData, hydrate, compareRevision, hostedSummary } from '../src/lib/finder.mjs';
import { renderIdentity, renderPicker, renderResults, renderBrowse } from '../src/lib/finder-view.mjs';
import { catalog, mediatek, pioneer, SHA, V1_ONLY_SHA, MTK_ONLY_SHA } from './fixtures/finder-catalog.mjs';

// The page ships clientData() and hydrates it; test through the same path.
const index = () => indexFinder(hydrate(JSON.parse(JSON.stringify(clientData(buildFinderData({ catalog: catalog(), mediatek: mediatek(), pioneer: pioneer() }))))));
const keys = item => [...item.targets].sort();

test('drive-reported strings parse to vendor, model, revision, hardware and ID', () => {
  assert.deepEqual((({ vendor, model, revision }) => ({ vendor, model, revision }))(parseDriveString('PIONEER BD-RW BDR-UD02D 1.01')),
    { vendor: 'PIONEER', model: 'BDR-UD02D', revision: '1.01' });
  const mkv = parseDriveString('Drive platform: Pioneer RS8410\nFirmware version: ID84');
  assert.equal(mkv.hardware, '8410'); assert.equal(mkv.destination, 'ID84'); assert.equal(mkv.model, null);
  const line = parseDriveString('PIONEER BD-RW BDR-S13U 1.05 RS9201 ID43');
  assert.deepEqual([line.model, line.revision, line.hardware, line.destination], ['BDR-S13U', '1.05', '9201', 'ID43']);
  const bare = parseDriveString('8510 ID19');
  assert.deepEqual([bare.bareHardware, bare.destination], [['8510'], 'ID19']);
  assert.equal(parseDriveString('mt1959').chipset, 'MT1959');
  const sdf = parseDriveString('HL-DT-ST-BD-RE_BH16NS40-NS50-1.00-N002502-211508191146');
  assert.deepEqual([sdf.vendor, sdf.model, sdf.board, sdf.revision, sdf.variantCode], ['HL-DT-ST', 'BH16NS40', 'NS50', '1.00', 'N002502']);
});

test('names resolve through aliases regardless of separators, grouped exact -> other names -> similar', () => {
  const ix = index();
  for (const q of ['BDR-S13U', 'bdr_s13u', 'BDR S13U', 'bdrs13u', 'PIONEER BD-RW BDR-S13U 1.02']) {
    const r = search(ix, q);
    assert.deepEqual(keys(r.exact[0]), ['pioneer:9201:ID43'], q);
    assert.match(r.exact[0].why, /Exact retail name/);
  }
  const oem = search(ix, 'E1020473');
  assert.deepEqual(keys(oem.exact[0]), ['pioneer:8510:ID19']);
  assert.ok(oem.otherNames.some(x => x.label === 'BDR-UD03' && /Same drive \(SAT 8510 · ID19\)/.test(x.why)));
  const similar = search(ix, 'S13');
  assert.ok(similar.similar.some(x => x.label === 'BDR-S13U') && similar.similar.every(x => /contains/.test(x.why)));
  assert.equal(search(ix, 'BDR-S13J-X').otherNames[0].label, 'BDR-S13J-BK');
});

test('hardware/ID and chipset queries jump to identities; mismatched hardware never resolves a name', () => {
  const ix = index();
  assert.deepEqual(keys(search(ix, '8510 ID19').exact[0]), ['pioneer:8510:ID19']);
  assert.deepEqual(keys(search(ix, 'SAT 9201').exact[0]), ['pioneer:9201:ID43', 'pioneer:9201:ID58', 'pioneer:9201:ID72']);
  assert.deepEqual(keys(search(ix, 'MT1959').exact[0]), ['mediatek:BW-16D1HT:W', 'mediatek:HL-DT-ST BU40N BU40:GENERAL']);
  assert.deepEqual(keys(search(ix, 'BDR-XD07 ID35').exact[0]), ['pioneer:8D30:ID35']);
  assert.match(search(ix, 'BDR-S13U RS9200').exact[0].why, /none of its editions match/);
});

test('a name sold as several hardware/ID editions shows an explainer and picker', () => {
  const ix = index();
  const item = search(ix, 'BDR-XD07').exact[0];
  assert.equal(item.targets.length, 2);
  const options = pickerOptions(ix, item.targets);
  assert.deepEqual(options.map(o => o.destination), ['ID35', 'ID36']);
  assert.ok(options[0].soldAs.includes('BDR-XD07'));
  const html = renderPicker('BDR-XD07', options);
  assert.match(html, /was sold in 2 editions/); assert.match(html, /data-key="pioneer:8D30:ID35"/);
  assert.match(html, /MakeMKV/); assert.match(html, /Drive platform: Pioneer RS8410/);
  assert.doesNotMatch(html, /identify/);
});

test('URL params deep-link to an identity, a picker, a query or cross-flash mode', () => {
  const ix = index();
  const one = routeFromUrl(ix, '?hw=SAT%209201&id=43&rev=1.02');
  assert.deepEqual([one.view, one.keys, one.known.revision, one.mode], ['identity', ['pioneer:9201:ID43'], '1.02', 'firmware']);
  assert.deepEqual(routeFromUrl(ix, '?hw=RS8D30').keys.sort(), ['pioneer:8D30:ID35', 'pioneer:8D30:ID36']);
  assert.equal(routeFromUrl(ix, '?hw=8D30').view, 'picker');
  assert.deepEqual([routeFromUrl(ix, '?q=BDR-S13U').view, routeFromUrl(ix, '?q=BDR-S13U').query], ['search', 'BDR-S13U']);
  assert.equal(routeFromUrl(ix, '?hw=0000&id=ID1').view, 'none');
  assert.equal(urlFor({ mode: 'firmware', identity: ix.byKey.get('pioneer:9201:ID43'), revision: '1.02' }), '?hw=9201&id=ID43&rev=1.02');
});

test('result view: checklist, recommended download and full timeline including known-missing revisions', () => {
  const ix = index();
  const view = identityView(ix, 'pioneer:9201:ID72', { hardware: '9201', destination: 'ID72', revision: '1.02' });
  assert.deepEqual(view.checklist.map(c => c.ok), [true, true, true]);
  assert.match(view.checklist[2].text, /Newest available is 1.03; your drive has 1.02/);
  assert.deepEqual(view.timeline.map(t => [t.revision, t.status]), [['1.03', 'available'], ['1.02', 'available'], ['1.01', 'missing']]);
  assert.ok(view.timeline[1].isCurrent && view.timeline[0].isRecommended);
  const html = renderIdentity(view, { protectedDownloads: true });
  assert.match(html, /Why this is the firmware for your drive/);
  assert.match(html, new RegExp(`data-firmware-package="${SHA.s13j103}"`));
  assert.match(html, /1\.01<\/span> <span class="fx-missing">Known to exist[^]*discord\.gg\/yu7xMGTyek/);
  assert.match(html, /Where it comes from:<\/strong> Pioneer BDR-S13JX firmware 1.03; published as 1.03, 1.03EU/);
  assert.match(html, /<details class="fx-details">[^]*fx-sha/);
  // Kernel-bearing package is recommended within a revision.
  assert.equal(identityView(ix, 'pioneer:9201:ID43').recommended.package.sha256, SHA.s13u105k);
  assert.match(renderIdentity(identityView(ix, 'pioneer:9201:ID43')), /Kernel \+ Normal/);
});

test('a different ID or hardware than the drive reports never offers a download', () => {
  const ix = index();
  const html = renderIdentity(identityView(ix, 'pioneer:9201:ID43', { hardware: '9201', destination: 'ID72' }), { protectedDownloads: true });
  assert.match(html, /Do not flash this/);
  assert.doesNotMatch(html, /data-firmware-package/);
});

test('MediaTek keeps feature badges and the build hint; public mode links the object with its filename', () => {
  const ix = index();
  const html = renderIdentity(identityView(ix, 'mediatek:HL-DT-ST BU40N BU40:GENERAL'), { baseUrl: 'https://example.test' });
  assert.match(html, /Region-free/); assert.match(html, /Hardware-verified/); assert.match(html, /Then build it/);
  assert.match(html, new RegExp(`href="https://example.test/fw/mediatek/${SHA.bu40}.bin" download="BU40N_1.00_`));
  assert.equal(identityView(ix, 'mediatek:HL-DT-ST BU40N BU40:GENERAL').recommended.package.modifiable, true);
  const pioneerHtml = renderIdentity(identityView(ix, 'pioneer:9201:ID43'), {});
  assert.doesNotMatch(pioneerHtml, /Then build it|drive-caps/);
});

test('v1 site entries missing from the v2 catalogue stay findable; duplicates by hash are not repeated', () => {
  const ix = index();
  const ud04 = ix.byKey.get('pioneer:8A10:ID40');
  assert.equal(ud04.revisions[0].packages[0].sha256, V1_ONLY_SHA);
  assert.equal(ud04.revisions[0].packages[0].file, `pioneer/BDR-UD04/SAT%208A10/1.14EU/${V1_ONLY_SHA}.tar`);
  assert.ok(ix.identities.some(i => i.revisions.some(r => r.packages.some(p => p.sha256 === MTK_ONLY_SHA))));
  const all = ix.identities.flatMap(i => i.revisions.flatMap(r => r.packages.map(p => p.sha256)));
  assert.equal(all.filter(s => s === SHA.s13u102).length, 1);
  assert.equal(hostedSummary(ix).total, all.length);
});

test('no-match state explains and suggests close names; browse groups brand -> family -> hardware', () => {
  const ix = index();
  assert.ok(suggestions(ix, 'BDR-S13V').includes('BDR-S13U'));
  const r = search(ix, 'Drive platform: Pioneer RS8410 / Firmware version: ID84');
  const { html } = renderResults(r, { suggestions: [] });
  assert.match(html, /don’t have firmware for hardware 8410 and ID84/);
  const tree = browseTree(ix);
  const pioneerBrand = tree.find(b => b.brand === 'Pioneer');
  const hw9201 = pioneerBrand.families.find(f => f.family === 'Pioneer').hardware.find(h => h.hardware === '9201');
  assert.deepEqual([hw9201.editions, hw9201.revisions], [3, 5]);
  assert.match(renderBrowse(tree), /data-keys="pioneer:9201:ID43,pioneer:9201:ID72,pioneer:9201:ID58"|data-keys="[^"]*9201[^"]*"/);
});

test('revision ordering is numeric and ignores region suffixes', () => {
  assert.ok(compareRevision('1.10', '1.02') > 0);
  assert.equal(compareRevision('1.02EU', '1.02'), 0);
});
