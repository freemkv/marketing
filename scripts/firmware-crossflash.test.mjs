import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinderData, crossflashTargets, finderPageData } from '../src/lib/finder.mjs';
import { catalog } from './fixtures/finder-catalog.mjs';

// One hardware family over four SATs; only K+N revisions are cross-flash targets.
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

test('targets: same family only, and only revisions with Kernel + Normal', () => {
  const data = buildFinderData({ catalog: familyCatalog() });
  const by = k => data.identities.find(i => i.key === k);
  const t = crossflashTargets(data, by('pioneer:8510:ID19'));
  assert.deepEqual(t.map(x => [x.identity.key, x.revisions.map(r => r.revision)]),
    [['pioneer:8A10:ID40', ['1.14']], ['pioneer:8591:ID22', ['1.10']]]);
  assert.deepEqual(crossflashTargets(data, by('pioneer:9201:ID43')), []);
});

test('page data: [identity, [versions]] rows and a UHD flag; nothing without a family', () => {
  const d = finderPageData(buildFinderData({ catalog: familyCatalog() }));
  const by = n => d.identities.findIndex(i => i.n === n);
  const ud03 = d.identities[by('BDR-UD03')];
  assert.deepEqual(ud03.x.map(([t, vs]) => [d.identities[t].n, vs.map(v => d.versions[v].r), d.identities[t].u ?? 0]),
    [['BDR-UD04', ['1.14'], 1], ['SBC-06D2X-U', ['1.10'], 0]]);
  assert.deepEqual(d.identities[by('BDR-S13U')].x, []);
});

test('the base fixture (no family ids) and MediaTek never produce cross-flash rows', () => {
  const d = finderPageData(buildFinderData({ catalog: catalog() }));
  for (const i of d.identities) assert.deepEqual(i.x, []);
});
