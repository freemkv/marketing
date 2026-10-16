import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinderData, crossflashTargets, finderPageData } from '../src/lib/finder.mjs';
import { catalog, mediatekFamilyCatalog, mediatekFamilyLinks, MTK_SHA } from './fixtures/finder-catalog.mjs';

// The finder does not decide crossflash: it lists freemkv-flash's links
// (`freemkv-crossflash` output, installed sha256 -> [target sha256]) per identity.
const sha = c => c.repeat(64).slice(0, 64);
const pkg = (s, rev, model, { kn = false, uhd = false } = {}) => ({
  sha256: s, bytes: 2048, key: `fw/pioneer/${s}.tar`, filename: `${model}_${rev}_${s.slice(0, 8)}.tar`, revision: rev,
  packageType: 'pioneer-installer', brand: 'PIONEER', embedded_model: model, selection: kn ? 'source-contained' : 'normal-only',
  components: kn ? [{ role: 'kernel' }, { role: 'normal' }] : [{ role: 'normal' }], advertised_versions: [rev + 'EU'], is_uhd: uhd,
});
const ident = (hw, dest, model, revisions) => ({ key: `pioneer:${hw}:${dest}`, family: 'pioneer', hardware: hw, destination: dest,
  platforms: ['pioneer'], embedded_models: [model], revisions, other_candidates: [] });
const familyCatalog = () => ({
  format: 'freemkv-finder-catalog', version: 2, withdrawn: [],
  identities: [
    ident('8A10', 'ID40', 'BDR-UD04', [
      { revision: '1.14', packages: [pkg(sha('A'), '1.14', 'BDR-UD04', { kn: true, uhd: true })] },
      { revision: '1.11', packages: [pkg(sha('B'), '1.11', 'BDR-UD04', { uhd: true })] },
    ]),
    ident('8591', 'ID22', 'SBC-06D2X-U', [{ revision: '1.10', packages: [pkg(sha('C'), '1.10', 'SBC-06D2X-U', { kn: true })] }]),
    ident('8511', 'ID22', 'SBW-06D2X-U', [{ revision: '1.10', packages: [pkg(sha('D'), '1.10', 'SBW-06D2X-U')] }]),
    ident('8510', 'ID19', 'BDR-UD03', [{ revision: '1.03', packages: [pkg(sha('E'), '1.03', 'BDR-UD03', { kn: true })] }]),
    ident('9201', 'ID43', 'BDR-S13U', [{ revision: '1.05', packages: [pkg(sha('F'), '1.05', 'BDR-S13U', { kn: true })] }]),
  ],
  aliases: [],
});
// UD03 (8510) crossflashes to the UD04 1.14 and SBC 1.10 Kernel+Normal packages;
// UD04 1.14 back to UD03. Nothing links to the Normal-only packages or the S13U.
const familyLinks = () => ({ format: 'freemkv-crossflash-links', version: 1, links: {
  [sha('E')]: [sha('A'), sha('C')],
  [sha('A')]: [sha('E')],
} });

test('targets are the linked identities; a revision is complete when it has a linked package', () => {
  const data = buildFinderData({ catalog: familyCatalog(), crossflash: familyLinks() });
  const by = k => data.identities.find(i => i.key === k);
  assert.deepEqual(crossflashTargets(data, by('pioneer:8510:ID19')).map(x => [x.identity.key, x.revisions.map(r => [r.revision, r.complete])]),
    [['pioneer:8A10:ID40', [['1.14', true], ['1.11', false]]], ['pioneer:8591:ID22', [['1.10', true]]]]);
  // Any package of the identity may be the installed one: UD04 1.14 links back to UD03.
  assert.deepEqual(crossflashTargets(data, by('pioneer:8A10:ID40')).map(x => x.identity.key), ['pioneer:8510:ID19']);
  // No links out: no targets.
  assert.deepEqual(crossflashTargets(data, by('pioneer:9201:ID43')), []);
  assert.deepEqual(crossflashTargets(data, by('pioneer:8511:ID22')), []);
});

test('without links nothing is offered (the finder never guesses)', () => {
  const data = buildFinderData({ catalog: familyCatalog() });
  for (const i of data.identities) assert.deepEqual(crossflashTargets(data, i), []);
  const d = finderPageData(buildFinderData({ catalog: catalog() }));
  for (const i of d.identities) assert.deepEqual(i.x, []);
});

test('page data: [name, uhd, rows] per target name, one row per revision', () => {
  const d = finderPageData(buildFinderData({ catalog: familyCatalog(), crossflash: familyLinks() }));
  const by = n => d.identities.findIndex(i => i.n === n);
  const view = i => d.identities[by(i)].x.map(([name, u, rows]) => [name, u, rows.map(([t, v, inc]) => [d.identities[t].n, d.versions[v].r, inc])]);
  assert.deepEqual(view('BDR-UD03').sort(), [
    ['BDR-UD04', 1, [['BDR-UD04', '1.14', 0], ['BDR-UD04', '1.11', 1]]],
    ['SBC-06D2X-U', 0, [['SBC-06D2X-U', '1.10', 0]]],
  ]);
  assert.deepEqual(d.identities[by('BDR-S13U')].x, []);
});

test('editions sharing a name share one heading, with one row per revision and edition', () => {
  const cat = familyCatalog();
  cat.identities.push(ident('8A11', 'ID41', 'BDR-UD04', [
    { revision: '1.11', packages: [pkg(sha('G'), '1.11', 'BDR-UD04', { kn: true })] },
    { revision: '1.20', packages: [pkg(sha('H'), '1.20', 'BDR-UD04')] },
  ]));
  const links = familyLinks();
  links.links[sha('E')].push(sha('G'));
  const d = finderPageData(buildFinderData({ catalog: cat, crossflash: links }));
  const ud03 = d.identities.find(i => i.n === 'BDR-UD03');
  const ud04 = ud03.x.filter(([name]) => name === 'BDR-UD04');
  assert.equal(ud04.length, 1);
  assert.deepEqual(ud04[0][2].map(([t, v, inc]) => [d.versions[v].r, d.identities[t].e, inc]),
    [['1.20', 'ID41', 1], ['1.14', 'ID40', 0], ['1.11', 'ID40', 1], ['1.11', 'ID41', 0]]);
});

test('MediaTek: linked models list each other; unlinked models list nothing', () => {
  const data = buildFinderData({ catalog: mediatekFamilyCatalog(), crossflash: mediatekFamilyLinks() });
  const by = k => data.identities.find(i => i.key === k);
  assert.deepEqual(crossflashTargets(data, by('mediatek:BU40N:GENERAL'))
    .map(x => [x.identity.key, x.revisions.map(r => [r.revision, r.complete])]),
    [['mediatek:WH16NS60:GENERAL', [['1.03', true]]]]);
  assert.deepEqual(crossflashTargets(data, by('mediatek:WH16NS60:GENERAL'))
    .map(x => [x.identity.key, x.revisions.map(r => [r.revision, r.complete])]),
    [['mediatek:BU40N:GENERAL', [['1.00', true]]]]);
  assert.deepEqual(crossflashTargets(data, by('mediatek:BW-16D1HT:BUFFALO')), []);
  assert.deepEqual(crossflashTargets(data, by('mediatek:BH16NS55:GENERAL')), []);
  assert.ok(MTK_SHA.bu40n);
});

test('future candidates stay visible with a Future flag; available revisions take precedence', () => {
  const links = familyLinks();
  links.version = 2;
  links.future = { [sha('E')]: [sha('A'), sha('F')] };
  const data = buildFinderData({ catalog: familyCatalog(), crossflash: links });
  const source = data.identities.find(i => i.key === 'pioneer:8510:ID19');
  const targets = crossflashTargets(data, source);
  assert.equal(targets.find(t => t.identity.key === 'pioneer:8A10:ID40').revisions[0].future, undefined);
  assert.deepEqual(targets.find(t => t.identity.key === 'pioneer:9201:ID43').revisions, [{ revision: '1.05', complete: false, future: true }]);
  assert.ok(!targets.some(t => t.identity.key === 'pioneer:8511:ID22'));
  const page = finderPageData(data);
  const rows = page.identities.find(i => i.n === 'BDR-UD03').x.find(([name]) => name === 'BDR-S13U')[2];
  assert.deepEqual(rows.map(row => row.slice(2)), [[0, 1]]);
});

test('future-only graphs list targets without requiring an available link', () => {
  const data = buildFinderData({ catalog: familyCatalog(), crossflash: {
    format: 'freemkv-crossflash-links', version: 2, links: {}, future: { [sha('E')]: [sha('F')] },
  } });
  const source = data.identities.find(i => i.key === 'pioneer:8510:ID19');
  assert.deepEqual(crossflashTargets(data, source).map(t => t.identity.key), ['pioneer:9201:ID43']);
});
