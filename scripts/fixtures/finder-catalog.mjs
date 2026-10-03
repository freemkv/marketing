// Small finder-catalog.json v2 fixture shaped like `fwext publish-catalog` output.
const sha = c => c.repeat(64).slice(0, 64);
const pkg = (s, rev, model, extra = {}) => ({
  sha256: s, bytes: 1000, key: `fw/pioneer/${s}.tar`, filename: `${model}_${rev}_${s.slice(0, 8)}.tar`,
  revision: rev, packageType: 'pioneer-installer', modifiable: false, brand: 'PIONEER', embedded_model: model,
  selection: 'normal-only', components: [{ role: 'normal', sha256: sha('9') }], normal_sha256: sha('9'),
  advertised_versions: [rev, rev + 'EU'], generated_date: '22/02/16', ...extra,
});
const ident = (hardware, destination, models, revisions, candidates = [], family = 'pioneer') => ({
  key: `${family}:${hardware}:${destination}`, family, hardware, destination, platforms: [family === 'pioneer' ? 'pioneer' : 'MT1959'],
  embedded_models: models, revisions, other_candidates: candidates,
});
const alias = (display, kind, targets, ref) => ({ name: display.toUpperCase().replace(/[^A-Z0-9]/g, ''), display, displays: [display], kind,
  targets: targets.map(([hardware, destination, family = 'pioneer']) => ({ family, hardware, destination })), evidence: ref ? [{ source: 'test', ref }] : [] });

export const SHA = {
  s13u102: sha('a'), s13u105k: sha('b'), s13u105n: sha('c'), s13j102: sha('d'), s13j103: sha('e'), s213: sha('f'),
  s12: sha('1'), ud03: sha('2'), xd35: sha('3'), xd36: sha('4'), bu40: sha('5'),
};
export const STEPS = [
  { action: 'downgrade', identity: 'pioneer:9201:ID43', from_revision: '1.05', to_revision: '1.02', tool: 'beta 62' },
  { action: 'crossflash', identity: 'pioneer:9201:ID72', revision: '1.02' },
  { action: 'update', identity: 'pioneer:9201:ID72', revision: '1.03', tool: 'official Pioneer updater' },
];
export function catalog() {
  return {
    format: 'freemkv-finder-catalog', version: 2, withdrawn: [],
    identities: [
      ident('9201', 'ID43', ['BDR-S13U'], [
        { revision: '1.02', packages: [pkg(SHA.s13u102, '1.02', 'BDR-S13U')] },
        { revision: '1.05', packages: [pkg(SHA.s13u105n, '1.05', 'BDR-S13U'),
          pkg(SHA.s13u105k, '1.05', 'BDR-S13U', { selection: 'source-contained', kernel_revision: '1.00', components: [{ role: 'kernel' }, { role: 'normal' }] })] },
      ], [
        { key: 'pioneer:9201:ID72', hardware: '9201', destination: 'ID72', crossflash_status: 'proven', steps: STEPS,
          evidence: [{ source: 'owner-report', date: '2026-10-02', quote: 'S13U 1.05 to 1.02 using beta 62, then crossflashed to S13J-X' }] },
        { key: 'pioneer:9201:ID58', hardware: '9201', destination: 'ID58', crossflash_status: 'likely', steps: [], evidence: [],
          kernel_comparisons: [{ decoded_bytes: 65536, differing_bytes: 5, likely: true, regions: [{ kind: 'id-label' }, { kind: 'checksum' }, { kind: 'model-string' }] }] },
        // Never shown: different hardware, even if a catalogue lists it.
        { key: 'pioneer:9200:ID43', hardware: '9200', destination: 'ID43', crossflash_status: 'proven', steps: STEPS, evidence: [] },
      ]),
      { ...ident('9201', 'ID72', ['BDR-S13JX'], [
        { revision: '1.02', packages: [pkg(SHA.s13j102, '1.02', 'BDR-S13JX')] },
        { revision: '1.03', packages: [pkg(SHA.s13j103, '1.03', 'BDR-S13JX')] },
      ], [
        { key: 'pioneer:9201:ID43', hardware: '9201', destination: 'ID43', crossflash_status: 'untested' },
        { key: 'pioneer:9201:ID58', hardware: '9201', destination: 'ID58', crossflash_status: 'untested' },
      ]), missing_revisions: ['1.01'] },
      ident('9201', 'ID58', ['BDR-213U'], [{ revision: '1.05', packages: [pkg(SHA.s213, '1.05', 'BDR-213U')] }], [
        { key: 'pioneer:9201:ID72', hardware: '9201', destination: 'ID72', crossflash_status: 'untested' },
        { key: 'pioneer:9201:ID43', hardware: '9201', destination: 'ID43', crossflash_status: 'likely' },
      ]),
      ident('9200', 'ID43', ['BDR-S12U'], [{ revision: '1.01', packages: [pkg(SHA.s12, '1.01', 'BDR-S12U')] }]),
      ident('8510', 'ID19', ['BDR-UD03'], [{ revision: '1.03', packages: [pkg(SHA.ud03, '1.03', 'BDR-UD03')] }]),
      ident('8D30', 'ID35', ['BDR-XD07'], [{ revision: '1.10', packages: [pkg(SHA.xd35, '1.10', 'BDR-XD07')] }]),
      ident('8D30', 'ID36', ['BDR-XD07J'], [{ revision: '1.10', packages: [pkg(SHA.xd36, '1.10', 'BDR-XD07J')] }]),
      ident('HL-DT-ST BU40N BU40', 'GENERAL', ['BU40N'], [{ revision: '1.00', packages: [{ sha256: SHA.bu40, bytes: 2048,
        key: `fw/mediatek/${SHA.bu40}.bin`, filename: `BU40N_1.00_${SHA.bu40.slice(0, 8)}.bin`, revision: '1.00', packageType: 'mediatek-image', build_id: '1711201943' }] }], [], 'mediatek'),
    ],
    aliases: [
      alias('BDR-S13U', 'retail', [['9201', 'ID43']], 'BDR-S13U_FW105EU.zip'),
      alias('BDR-S13J-X', 'retail', [['9201', 'ID72']]),
      alias('BDR-S13J-BK', 'release', [['9201', 'ID72']]),
      alias('BDR-213U', 'retail', [['9201', 'ID58']]),
      alias('BDR-S12U', 'retail', [['9200', 'ID43']]),
      alias('BDR-UD03', 'retail', [['8510', 'ID19']]),
      alias('E1020473', 'oem', [['8510', 'ID19']], 'Fujitsu FMV E1020473'),
      alias('BDR-XD07', 'retail', [['8D30', 'ID35'], ['8D30', 'ID36']]),
      alias('BU40N', 'retail', [['HL-DT-ST BU40N BU40', 'GENERAL', 'mediatek']]),
    ],
  };
}
// v1 site indexes: one MediaTek entry carrying features for the v2 image, one
// MediaTek file not in the hoard, one Pioneer v1 entry already in v2 and one not.
export function mediatek() {
  return [
    { brand: 'LG', model: 'BU40N', versions: [{ rev: '1.00', file: 'MT1959/BU40N_1.00.bin', sha256: SHA.bu40, chipset: 'MT1959', modifiable: true,
      confidence: 'hardware-verified', features: [{ key: 'Region', name: 'Region-free', ok: true }] }] },
    { brand: 'ASUS', model: 'BW-16D1HT', versions: [{ rev: '3.02', file: 'MT1959/BW-16D1HT_3.02.bin', sha256: sha('7'), chipset: 'MT1959', variant: 'W000900',
      modifiable: true, features: [{ key: 'UHD', name: 'UHD', ok: true }] }] },
  ];
}
export function pioneer() {
  return [
    { brand: 'PIONEER', model: 'BDR-S13U', versions: [{ rev: '1.02EU', embeddedRev: '1.02', file: `pioneer/BDR-S13U/SAT%209201/1.02EU/${SHA.s13u102}.tar`, sha256: SHA.s13u102, hardware: 'SAT 9201', destination: 'ID43', packageType: 'pioneer-installer' }] },
    { brand: 'PIONEER', model: 'BDR-UD04', versions: [{ rev: '1.14EU', embeddedRev: '1.14', file: `pioneer/BDR-UD04/SAT%208A10/1.14EU/${sha('8')}.tar`, sha256: sha('8'), bytes: 10, hardware: 'SAT 8A10', destination: 'ID40', kernelVersion: 'ID40', embeddedModel: 'BDR-UD04', packageType: 'pioneer-installer', components: ['kernel', 'main'] }] },
  ];
}
export const V1_ONLY_SHA = sha('8');
export const MTK_ONLY_SHA = sha('7');
