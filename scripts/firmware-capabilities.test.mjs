import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_SETTING, validateCapabilityCoverage } from '../src/lib/firmware-capabilities.mjs';

function fixture() {
  const hash = 'a'.repeat(64);
  const catalog = { identities: [{ family: 'mediatek', revisions: [{ packages: [{ image_sha256: hash }] }] }] };
  const settings = Object.fromEntries([...new Set(Object.values(FEATURE_SETTING))].map(key => [key, { supported: key !== 'unrestricted', choices: key === 'unrestricted' ? [] : ['oem', 'on'] }]));
  const manifest = { schema: 1, producer: { tool: 'freemkv-fw', version: '0.15.4', sha256: 'b'.repeat(64) }, images: [{ schema: 1, input_sha256: hash, producer_version: '0.15.4', producer_sha256: 'b'.repeat(64), status: 'supported', output_sha256: 'c'.repeat(64), flash_admitted: true, report: { boot_settings: settings } }] };
  const index = [{ versions: [{ sha256: hash, modifiable: true, features: Object.entries(FEATURE_SETTING).map(([key, setting]) => ({ key, ok: settings[setting].supported })) }] }];
  return { catalog, manifest, index };
}

test('exact-image capabilities retain independent unavailable features', () => {
  const { catalog, manifest, index } = fixture();
  assert.equal(validateCapabilityCoverage(catalog, manifest, index).size, 1);
  index[0].versions[0].features.find(f => f.key === 'UHD').ok = true;
  assert.throws(() => validateCapabilityCoverage(catalog, manifest, index), /feature disagrees/);
});

test('publication refuses missing, duplicate, stale and omitted records', () => {
  for (const mutate of [
    f => f.manifest.images.pop(),
    f => f.manifest.images.push(f.manifest.images[0]),
    f => { f.manifest.images[0].producer_version = 'old'; },
    f => { f.manifest.images[0].producer_sha256 = 'e'.repeat(64); },
    f => { f.manifest.images[0].input_sha256 = 'd'.repeat(64); },
    f => { f.index[0].versions = []; },
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => validateCapabilityCoverage(f.catalog, f.manifest, f.index));
  }
  const f = fixture();
  assert.throws(() => validateCapabilityCoverage(f.catalog, f.manifest, f.index, { producerSha: 'e'.repeat(64) }), /Stale Modify producer/);
});

test('unsupported firmware stays visible with a reason and no advertised features', () => {
  const { catalog, manifest, index } = fixture();
  Object.assign(manifest.images[0], { status: 'unsupported', report: null, reason: 'safe-space-unavailable', output_sha256: null, flash_admitted: false });
  index[0].versions[0].modifiable = false;
  index[0].versions[0].features.forEach(f => { f.ok = false; });
  assert.equal(validateCapabilityCoverage(catalog, manifest, index).size, 1);
  delete manifest.images[0].reason;
  assert.throws(() => validateCapabilityCoverage(catalog, manifest, index), /explicit reason/);
});
