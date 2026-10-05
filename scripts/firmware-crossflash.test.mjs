import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinderData, crossflashTargets, finderPageData } from '../src/lib/finder.mjs';
import { catalog } from './fixtures/finder-catalog.mjs';

// One hardware family over four SATs; revisions without a Kernel are listed as incomplete.
const sha = c => c.repeat(64).slice(0, 64);
const FAM = '748b2f82aa55aa55';
const pkg = (s, rev, model, { kn = false, uhd = false, family = FAM } = {}) => ({
  sha256: s, bytes: 2048, key: `fw/pioneer/${s}.tar`, filename: `${model}_${rev}_${s.slice(0, 8)}.tar`, revision: rev,
  packageType: 'pioneer-installer', brand: 'PIONEER', embedded_model: model, selection: kn ? 'source-contained' : 'normal-only',
  components: kn ? [{ role: 'kernel' }, { role: 'normal' }] : [{ role: 'normal' }], advertised_versions: [rev + 'EU'],
  family_id: family, is_uhd: uhd,
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
    ident('9201', 'ID43', 'BDR-S13U', [{ revision: '1.05', packages: [pkg(sha('F'), '1.05', 'BDR-S13U', { kn: true, family: 'other00000000000' })] }]),
  ],
  aliases: [],
});

test('targets: same family only; revisions without Kernel + Normal are incomplete', () => {
  const data = buildFinderData({ catalog: familyCatalog() });
  const by = k => data.identities.find(i => i.key === k);
  const t = crossflashTargets(data, by('pioneer:8510:ID19'));
  assert.deepEqual(t.map(x => [x.identity.key, x.revisions.map(r => [r.revision, r.complete])]),
    [['pioneer:8A10:ID40', [['1.14', true], ['1.11', false]]], ['pioneer:8591:ID22', [['1.10', true]]],
      ['pioneer:8511:ID22', [['1.10', false]]]]);
  assert.deepEqual(crossflashTargets(data, by('pioneer:9201:ID43')), []);
});

test('page data: [name, uhd, rows] per target name, one row per revision; nothing without a family', () => {
  const d = finderPageData(buildFinderData({ catalog: familyCatalog() }));
  const by = n => d.identities.findIndex(i => i.n === n);
  const view = i => d.identities[by(i)].x.map(([name, u, rows]) => [name, u, rows.map(([t, v, inc]) => [d.identities[t].n, d.versions[v].r, inc])]);
  assert.deepEqual(view('BDR-UD03').sort(), [
    ['BDR-UD04', 1, [['BDR-UD04', '1.14', 0], ['BDR-UD04', '1.11', 1]]],
    ['SBC-06D2X-U', 0, [['SBC-06D2X-U', '1.10', 0]]],
    ['SBW-06D2X-U', 0, [['SBW-06D2X-U', '1.10', 1]]],
  ]);
  assert.deepEqual(d.identities[by('BDR-S13U')].x, []);
});

test('editions sharing a name merge under one heading; a complete edition wins a shared revision', () => {
  const cat = familyCatalog();
  cat.identities.push(ident('8A11', 'ID41', 'BDR-UD04', [
    { revision: '1.11', packages: [pkg(sha('G'), '1.11', 'BDR-UD04', { kn: true })] },
    { revision: '1.20', packages: [pkg(sha('H'), '1.20', 'BDR-UD04')] },
  ]));
  const d = finderPageData(buildFinderData({ catalog: cat }));
  const ud03 = d.identities.find(i => i.n === 'BDR-UD03');
  const ud04 = ud03.x.filter(([name]) => name === 'BDR-UD04');
  assert.equal(ud04.length, 1);
  assert.deepEqual(ud04[0][2].map(([, v, inc]) => [d.versions[v].r, inc]), [['1.20', 1], ['1.14', 0], ['1.11', 0]]);
});

test('the base fixture (no family ids) and MediaTek never produce cross-flash rows', () => {
  const d = finderPageData(buildFinderData({ catalog: catalog() }));
  for (const i of d.identities) assert.deepEqual(i.x, []);
});
