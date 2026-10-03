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
  assert.match(renderCrossflash(ix.byKey.get('pioneer:9200:ID43'), lone), /No other editions of this hardware/);
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
