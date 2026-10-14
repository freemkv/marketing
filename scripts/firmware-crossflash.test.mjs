import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinderData, crossflashTargets, finderPageData } from '../src/lib/finder.mjs';
import { catalog, mediatekFamilyCatalog, MTK_FAMILY_ID } from './fixtures/finder-catalog.mjs';

// One hardware family over four SATs; revisions without a Kernel are listed as incomplete.
const sha = c => c.repeat(64).slice(0, 64);
const FAM = '748b2f82aa55aa55';
// Two Pioneer receiver classes: the family shares CLASS_X; CLASS_Y is a same-family,
// different-receiver-class edition the flasher would refuse, so it is never offered.
const CLASS_X = { off: [0x16900, 0x77300], rev: false };
const CLASS_Y = { off: [0x32400, 0xb1700], rev: true };
// A Kernel+Normal package carries a receiver class; a Normal-only one carries none
// (null) and so, like the flasher, is never a crossflash target.
const pkg = (s, rev, model, { kn = false, uhd = false, family = FAM, recv = kn ? CLASS_X : null } = {}) => ({
  sha256: s, bytes: 2048, key: `fw/pioneer/${s}.tar`, filename: `${model}_${rev}_${s.slice(0, 8)}.tar`, revision: rev,
  packageType: 'pioneer-installer', brand: 'PIONEER', embedded_model: model, selection: kn ? 'source-contained' : 'normal-only',
  components: kn ? [{ role: 'kernel' }, { role: 'normal' }] : [{ role: 'normal' }], advertised_versions: [rev + 'EU'],
  family_id: family, is_uhd: uhd,
  ...(recv ? { receiver_xor_offsets: recv.off, receiver_reverse: recv.rev } : {}),
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
    // Same family, but a different receiver class: the flasher refuses it, so it is never offered.
    ident('8512', 'ID23', 'BDR-PR1ML', [{ revision: '1.00', packages: [pkg(sha('Y'), '1.00', 'BDR-PR1ML', { kn: true, recv: CLASS_Y })] }]),
  ],
  aliases: [],
});

test('targets: same family AND same receiver class; revisions without Kernel + Normal are incomplete', () => {
  const data = buildFinderData({ catalog: familyCatalog() });
  const by = k => data.identities.find(i => i.key === k);
  const t = crossflashTargets(data, by('pioneer:8510:ID19'));
  // 8A10/8591 share the receiver class and are offered; 8511 (Normal-only, no
  // derivable class) and 8512 (different receiver class) are both excluded.
  assert.deepEqual(t.map(x => [x.identity.key, x.revisions.map(r => [r.revision, r.complete])]),
    [['pioneer:8A10:ID40', [['1.14', true], ['1.11', false]]], ['pioneer:8591:ID22', [['1.10', true]]]]);
  // Different hardware family: never a target.
  assert.deepEqual(crossflashTargets(data, by('pioneer:9201:ID43')), []);
  // A same-family, different-receiver-class edition offers nothing from the family either.
  assert.deepEqual(crossflashTargets(data, by('pioneer:8512:ID23')), []);
  // A Pioneer identity with no derivable receiver class (only a Normal-only
  // package) fails closed: it offers nothing even inside its own family.
  assert.equal(by('pioneer:8511:ID22').receiverKey, null);
  assert.deepEqual(crossflashTargets(data, by('pioneer:8511:ID22')), []);
});

test('page data: [name, uhd, rows] per target name, one row per revision; nothing without a family', () => {
  const d = finderPageData(buildFinderData({ catalog: familyCatalog() }));
  const by = n => d.identities.findIndex(i => i.n === n);
  const view = i => d.identities[by(i)].x.map(([name, u, rows]) => [name, u, rows.map(([t, v, inc]) => [d.identities[t].n, d.versions[v].r, inc])]);
  // SBW-06D2X-U (Normal-only, no receiver class) and BDR-PR1ML (different receiver
  // class) are both excluded by the receiver-class gate.
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
  const d = finderPageData(buildFinderData({ catalog: cat }));
  const ud03 = d.identities.find(i => i.n === 'BDR-UD03');
  const ud04 = ud03.x.filter(([name]) => name === 'BDR-UD04');
  assert.equal(ud04.length, 1);
  assert.deepEqual(ud04[0][2].map(([t, v, inc]) => [d.versions[v].r, d.identities[t].e, inc]),
    [['1.20', 'ID41', 1], ['1.14', 'ID40', 0], ['1.11', 'ID40', 1], ['1.11', 'ID41', 0]]);
});

test('the base fixture (no family ids) and MediaTek never produce cross-flash rows', () => {
  const d = finderPageData(buildFinderData({ catalog: catalog() }));
  for (const i of d.identities) assert.deepEqual(i.x, []);
});

test('MediaTek: same-family models cross-flash each other; other-family and family-less builds do not', () => {
  const data = buildFinderData({ catalog: mediatekFamilyCatalog() });
  const by = k => data.identities.find(i => i.key === k);
  // familyId is populated from the package family_id for MediaTek too.
  assert.equal(by('mediatek:BU40N:GENERAL').familyId, MTK_FAMILY_ID);
  // Two models share the family: each lists the other, and a full image is complete.
  assert.deepEqual(crossflashTargets(data, by('mediatek:BU40N:GENERAL'))
    .map(x => [x.identity.key, x.revisions.map(r => [r.revision, r.complete])]),
    [['mediatek:WH16NS60:GENERAL', [['1.03', true]]]]);
  assert.deepEqual(crossflashTargets(data, by('mediatek:WH16NS60:GENERAL'))
    .map(x => [x.identity.key, x.revisions.map(r => [r.revision, r.complete])]),
    [['mediatek:BU40N:GENERAL', [['1.00', true]]]]);
  // A different family hash is never a target.
  assert.deepEqual(crossflashTargets(data, by('mediatek:BW-16D1HT:BUFFALO')), []);
  // A stale package without family_id has no familyId and no targets.
  assert.equal(by('mediatek:BH16NS55:GENERAL').familyId, null);
  assert.deepEqual(crossflashTargets(data, by('mediatek:BH16NS55:GENERAL')), []);
});
