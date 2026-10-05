import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinderData, indexFinder, crossflashFrom, finderPageData } from '../src/lib/finder.mjs';
import { catalog } from './fixtures/finder-catalog.mjs';

const keys = groups => Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map(c => c.key)]));

test('I have X: same-hardware targets with their status; other hardware never', () => {
  const ix = indexFinder(buildFinderData({ catalog: catalog() }));
  assert.deepEqual(keys(crossflashFrom(ix, 'pioneer:9201:ID43')), { proven: ['pioneer:9201:ID72'], likely: ['pioneer:9201:ID58'], untested: [] });
  assert.deepEqual(keys(crossflashFrom(ix, 'pioneer:9201:ID72')), { proven: [], likely: [], untested: ['pioneer:9201:ID43', 'pioneer:9201:ID58'] });
  for (const key of ['pioneer:9201:ID43', 'pioneer:9201:ID72', 'pioneer:9201:ID58']) {
    const g = crossflashFrom(ix, key);
    for (const c of [...g.proven, ...g.likely, ...g.untested]) assert.equal(c.identity.hardware, '9201');
  }
  assert.deepEqual(keys(crossflashFrom(ix, 'pioneer:9200:ID43')), { proven: [], likely: [], untested: [] });
});

test('page data lists targets as [identity, status] with human names; none when there are no targets', () => {
  const d = finderPageData(buildFinderData({ catalog: catalog() }));
  const by = n => d.identities.findIndex(i => i.n === n);
  const s13u = d.identities[by('BDR-S13U')];
  assert.deepEqual(s13u.x.map(([t, s]) => [d.identities[t].n, d.identities[t].d, s]), [['BDR-S13J-X', 'ID72', 'proven'], ['BDR-213U', 'ID58', 'likely']]);
  assert.deepEqual(d.identities[by('BDR-S12U')].x, []);
  for (const i of d.identities) for (const [t] of i.x) assert.equal(d.identities[t].chips[1][0], i.chips[1][0]);
});

// MediaTek: same extractor crossflash_group (platform -> loader -> board) only.
function mtkCatalog() {
  const c = catalog();
  const G = 'MT1959/desktop/JB8/NS50', SLIM = 'MT1959/slim/JB8/NS50', OTHER = 'MT1939/desktop/JB7/board-unknown';
  const img = (n, rev) => ({ sha256: n.repeat(64), bytes: 2048, key: `fw/mediatek/${n.repeat(64)}.bin`, filename: `X_${rev}_${n.repeat(8)}.bin`, revision: rev, packageType: 'mediatek-image' });
  const mtk = (hardware, destination, group, rev, n, candidates) => ({ key: `mediatek:${hardware}:${destination}`, family: 'mediatek', hardware, destination,
    platforms: ['MT1959'], embedded_models: [hardware.split(' ')[1]], crossflash_group: group, revisions: [{ revision: rev, packages: [img(n, rev)] }], other_candidates: candidates });
  const cand = (hardware, destination, group, status = 'untested') => ({ key: `mediatek:${hardware}:${destination}`, hardware, destination, crossflash_group: group, crossflash_status: status });
  c.identities.push(
    mtk('HL-DT-ST BH16NS40 NS50', 'GENERAL', G, '1.03', 'a', [cand('HL-DT-ST BH16NS40 NS50', 'BUFFALO', G), cand('HL-DT-ST BU40N NS50', 'HP', SLIM), cand('HL-DT-ST BH16NS40 JB7', 'R?', OTHER)]),
    mtk('HL-DT-ST BH16NS40 NS50', 'BUFFALO', G, 'BU12', 'b', [cand('HL-DT-ST BH16NS40 NS50', 'GENERAL', G, 'reported')]),
    mtk('HL-DT-ST BU40N NS50', 'HP', SLIM, 'BW42', 'c', []),
    mtk('HL-DT-ST BH16NS40 JB7', 'R?', OTHER, '1.01', 'd', []),
  );
  return c;
}

test('MediaTek: same board group only; desktop/slim and other groups never; labels never show codes', () => {
  const ix = indexFinder(buildFinderData({ catalog: mtkCatalog() }));
  assert.deepEqual(keys(crossflashFrom(ix, 'mediatek:HL-DT-ST BH16NS40 NS50:GENERAL')), { proven: [], likely: [], untested: ['mediatek:HL-DT-ST BH16NS40 NS50:BUFFALO'] });
  assert.deepEqual(keys(crossflashFrom(ix, 'mediatek:HL-DT-ST BH16NS40 NS50:BUFFALO')).likely, ['mediatek:HL-DT-ST BH16NS40 NS50:GENERAL']);
  const d = finderPageData(buildFinderData({ catalog: mtkCatalog() }));
  const general = d.identities.find(i => i.n === 'BH16NS40' && i.x.length && !i.d);
  assert.deepEqual(general.x.map(([t, s]) => [d.identities[t].n, d.identities[t].d, s]), [['BH16NS40', 'Buffalo', 'untested']]);
  assert.ok(d.models.every(m => m.v.every(v => !/\?|GENERAL/.test(v[1]))));
});
