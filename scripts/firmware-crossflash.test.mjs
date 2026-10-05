import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinderData, indexFinder, crossflashFrom, crossflashTo, routeFromUrl, identityView, search } from '../src/lib/finder.mjs';
import { renderCrossflash, renderIdentity } from '../src/lib/finder-view.mjs';
import { catalog, mediatek, pioneer, SHA } from './fixtures/finder-catalog.mjs';

const index = () => indexFinder(buildFinderData({ catalog: catalog(), mediatek: mediatek(), pioneer: pioneer() }));
const keys = groups => Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map(c => c.key)]));

test('forward: S13U 9201/ID43 -> ID72 is proven with steps; ID58 likely; other hardware excluded', () => {
  const ix = index();
  const groups = crossflashFrom(ix, 'pioneer:9201:ID43');
  assert.deepEqual(keys(groups), { proven: ['pioneer:9201:ID72'], likely: ['pioneer:9201:ID58'], untested: [] });
  const proven = groups.proven[0];
  assert.equal(proven.steps.length, 3);
  assert.equal(proven.latest, '1.03');
  assert.ok(proven.names.includes('BDR-S13J-X'));
  assert.deepEqual(proven.changes.map(c => c.term), ['id', 'name']);
  assert.match(proven.changes[1].text, /report itself as BDR-S13JX instead of BDR-S13U/);
  const html = renderCrossflash(ix.byKey.get('pioneer:9201:ID43'), groups, { direction: 'from', protectedDownloads: true });
  assert.match(html, /★ Proven/);
  assert.match(html, /Downgrade from 1.05 to 1.02 using beta 62/);
  assert.match(html, /Cross-flash to 1.02 \(SAT 9201 · ID72\)/);
  assert.match(html, /Update to 1.03 using the official Pioneer updater/);
  assert.match(html, /S13U 1.05 to 1.02 using beta 62/);
  assert.match(html, /kernels differ in 5 of 65536 bytes \(id label, checksum, model string\)/);
  assert.match(html, /Only drives with the same hardware can cross-flash/);
  assert.match(html, new RegExp(`Cross-flash download: SAT 9201 · ID72 1.03[^]*?not your current edition`));
  assert.equal((html.match(/Report your result on Discord/g) || []).length, 2);
  assert.doesNotMatch(html, /9200/);
});

test('reverse: which drives can become ID72; untested paths carry a warning and labelled download', () => {
  const ix = index();
  const groups = crossflashTo(ix, 'pioneer:9201:ID72');
  assert.deepEqual(keys(groups), { proven: ['pioneer:9201:ID43'], likely: [], untested: ['pioneer:9201:ID58'] });
  assert.equal(groups.proven[0].steps[0].tool, 'beta 62');
  assert.ok(groups.untested[0].names.includes('BDR-213U'));
  const html = renderCrossflash(ix.byKey.get('pioneer:9201:ID72'), groups, { direction: 'to' });
  assert.match(html, /Which drives can become SAT 9201 · ID72\?/);
  assert.match(html, /From SAT 9201 · ID43/);
  assert.match(html, /Nobody has reported this conversion/);
  assert.match(html, /Untested cross-flash download: SAT 9201 · ID72 1.03/);
  const reverseOf43 = crossflashTo(ix, 'pioneer:9201:ID43');
  assert.deepEqual(keys(reverseOf43), { proven: [], likely: ['pioneer:9201:ID58'], untested: ['pioneer:9201:ID72'] });
});

test('different hardware is never a candidate in either direction', () => {
  const ix = index();
  for (const key of ['pioneer:9201:ID43', 'pioneer:9201:ID72', 'pioneer:9201:ID58']) {
    for (const g of [crossflashFrom(ix, key), crossflashTo(ix, key)])
      for (const c of [...g.proven, ...g.likely, ...g.untested]) assert.equal(c.identity.hardware, '9201');
  }
  const lone = crossflashFrom(ix, 'pioneer:9200:ID43');
  assert.deepEqual(keys(lone), { proven: [], likely: [], untested: [] });
  assert.match(renderCrossflash(ix.byKey.get('pioneer:9200:ID43'), lone), /No other editions it can cross-flash with/);
  assert.deepEqual(keys(crossflashTo(ix, 'pioneer:9200:ID43')), { proven: [], likely: [], untested: [] });
});

test('firmware view summarises conversions and links to cross-flash mode; ?mode=crossflash deep-links', () => {
  const ix = index();
  const html = renderIdentity(identityView(ix, 'pioneer:9201:ID43'));
  assert.match(html, /Convert to another edition/);
  assert.match(html, /★ Proven<\/span> SAT 9201 · ID72/);
  assert.match(html, /href="\/firmware\/find\/\?mode=crossflash&amp;hw=9201&amp;id=ID43"/);
  const route = routeFromUrl(ix, '?mode=crossflash&hw=9201&id=ID43');
  assert.deepEqual([route.mode, route.view, route.keys], ['crossflash', 'identity', ['pioneer:9201:ID43']]);
  // A pasted drive string in cross-flash mode resolves the same way.
  assert.deepEqual(search(ix, 'Drive platform: Pioneer RS9201 Firmware version: ID43').exact[0].targets, ['pioneer:9201:ID43']);
  assert.equal(routeFromUrl(ix, '?mode=other').mode, 'firmware');
  assert.ok(SHA.s13j103);
});

// MediaTek: same extractor crossflash_group (platform -> loader -> board) only.
function mtkCatalog() {
  const c = catalog();
  const G = 'MT1959/desktop/JB8/NS50', SLIM = 'MT1959/slim/JB8/NS50', OTHER = 'MT1939/desktop/JB7/board-unknown';
  const img = (n, rev, extra = {}) => ({ sha256: n.repeat(64), bytes: 2048, key: `fw/mediatek/${n.repeat(64)}.bin`, filename: `X_${rev}_${n.repeat(8)}.bin`,
    revision: rev, packageType: 'mediatek-image', ...extra });
  const mtk = (hardware, destination, group, rev, n, candidates, extra = {}) => ({ key: `mediatek:${hardware}:${destination}`, family: 'mediatek', hardware, destination,
    platforms: ['MT1959'], embedded_models: [hardware.split(' ')[1]], crossflash_group: group, revisions: [{ revision: rev, packages: [img(n, rev, extra)] }], other_candidates: candidates });
  const cand = (hardware, destination, group, status = 'untested') => ({ key: `mediatek:${hardware}:${destination}`, hardware, destination, crossflash_group: group, crossflash_status: status, caution: 'oem-change' });
  c.identities.push(
    mtk('HL-DT-ST BH16NS40 NS50', 'N', G, '1.03', 'a', [cand('HL-DT-ST BH16NS40 NS50', 'W', G), cand('HL-DT-ST BU40N NS50', 'P', SLIM), cand('HL-DT-ST BH16NS40 JB7', 'N', OTHER), { key: 'mediatek:HL-DT-ST BH16NS48 NS50:N', crossflash_status: 'untested' }],
      { provenance: 'LG BH16NS40 1.03 from the LG support site, captured 2019-04-02' }),
    { ...mtk('HL-DT-ST BH16NS40 NS50', 'W', G, '1.02', 'b', [cand('HL-DT-ST BH16NS40 NS50', 'N', G, 'reported')]), missing_revisions: [{ revision: '1.03', evidence: [{ source: 'forum' }] }, '1.01'] },
    mtk('HL-DT-ST BU40N NS50', 'P', SLIM, '1.00', 'c', [cand('HL-DT-ST BH16NS40 NS50', 'N', G)]),
    mtk('HL-DT-ST BH16NS40 JB7', 'N', OTHER, '1.01', 'd', []),
    mtk('HL-DT-ST BH16NS48 NS50', 'N', G, '1.00', 'e', []),
  );
  return c;
}

test('MediaTek: no crossflash is supported — every mediatek lookup returns empty', () => {
  const ix = indexFinder(buildFinderData({ catalog: mtkCatalog() }));
  const empty = { proven: [], likely: [], untested: [] };
  // Same-group, different-group, slim-vs-desktop: all return nothing on mediatek.
  assert.deepEqual(keys(crossflashFrom(ix, 'mediatek:HL-DT-ST BH16NS40 NS50:N')), empty);
  assert.deepEqual(keys(crossflashTo(ix, 'mediatek:HL-DT-ST BH16NS40 NS50:N')), empty);
  assert.deepEqual(keys(crossflashFrom(ix, 'mediatek:HL-DT-ST BU40N NS50:P')), empty);
  // Pioneer still crossflashes within the same hardware.
  assert.deepEqual(keys(crossflashFrom(ix, 'pioneer:9201:ID43')).proven, ['pioneer:9201:ID72']);
});

test('Pioneer family: cross-flash lists same-family drives with Kernel+Normal, marks UHD', () => {
  // Build a UD04-like family of 4 SATs sharing one family_id. Only two carry a
  // package with both kernel+normal; those must appear as cross-flash options.
  const sha = c => c.repeat(64).slice(0, 64);
  const FAM = '748b2f82';
  const pkg = (s, rev, model, { k = false, uhd = false } = {}) => ({
    sha256: s, bytes: 2048, key: `fw/pioneer/${s}.tar`, filename: `${model}_${rev}_${s.slice(0, 8)}.tar`,
    revision: rev, packageType: 'pioneer-installer', brand: 'PIONEER', embedded_model: model,
    selection: k ? 'source-contained' : 'normal-only',
    components: k ? [{ role: 'kernel' }, { role: 'normal' }] : [{ role: 'normal' }],
    advertised_versions: [rev + 'EU'], family_id: FAM, is_uhd: uhd,
  });
  const famIdent = (hw, dest, model, revs) => ({
    key: `pioneer:${hw}:${dest}`, family: 'pioneer', hardware: hw, destination: dest,
    platforms: ['pioneer'], embedded_models: [model], revisions: revs, other_candidates: [],
  });
  const c = {
    format: 'freemkv-finder-catalog', version: 2, withdrawn: [],
    identities: [
      famIdent('8A10', 'ID40', 'BDR-UD04', [{ revision: '1.14', packages: [pkg(sha('A'), '1.14', 'BDR-UD04', { k: true, uhd: true })] }]),
      famIdent('8591', 'ID59', 'BDR-UD05', [{ revision: '1.11', packages: [pkg(sha('B'), '1.11', 'BDR-UD05', { k: true })] }]),
      // Same family, only Normal — must NOT appear (cross-era needs both).
      famIdent('8511', 'ID51', 'BDR-UD06', [{ revision: '1.05', packages: [pkg(sha('C'), '1.05', 'BDR-UD06')] }]),
      // Same family, source identity itself.
      famIdent('8510', 'ID50', 'BDR-UD07', [{ revision: '1.00', packages: [pkg(sha('D'), '1.00', 'BDR-UD07', { k: true })] }]),
    ],
    aliases: [],
  };
  const ix = indexFinder(buildFinderData({ catalog: c }));
  const view = identityView(ix, 'pioneer:8510:ID50');
  const keys = view.familyCrossflash.map(x => x.key);
  assert.deepEqual(keys.sort(), ['pioneer:8591:ID59', 'pioneer:8A10:ID40']);
  const uhdRow = view.familyCrossflash.find(x => x.key === 'pioneer:8A10:ID40');
  assert.equal(uhdRow.isUhd, true);
  const html = renderIdentity(view);
  assert.match(html, /Cross flash/);
  assert.match(html, /SAT 8A10 · ID40 — BDR-UD04/);
  assert.match(html, /SAT 8A10 · ID40 — BDR-UD04[^]*?UHD<\/span>/);
  assert.match(html, /SAT 8591 · ID59/);
  assert.doesNotMatch(html, /BDR-UD06/);
});

test('catalogue missing_revisions and per-package provenance populate the timeline and provenance line', () => {
  const ix = indexFinder(buildFinderData({ catalog: mtkCatalog() }));
  const w = identityView(ix, 'mediatek:HL-DT-ST BH16NS40 NS50:W');
  assert.deepEqual(w.timeline.map(t => [t.revision, t.status]), [['1.03', 'missing'], ['1.02', 'available'], ['1.01', 'missing']]);
  assert.match(renderIdentity(w), /1\.03<\/span> <span class="fx-missing">Known to exist/);
  const n = identityView(ix, 'mediatek:HL-DT-ST BH16NS40 NS50:N');
  assert.equal(n.provenance, 'LG BH16NS40 1.03 from the LG support site, captured 2019-04-02');
  assert.match(renderIdentity(n), /Where it comes from:<\/strong> LG BH16NS40 1.03 from the LG support site/);
});
