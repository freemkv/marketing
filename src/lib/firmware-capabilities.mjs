// Build-time contract shared by publication and the firmware finder.
export const FEATURE_SETTING = { Speed: 'speed', Region: 'region', UHD: 'unrestricted', BD: 'unrestricted', HRL: 'hrl', AKE: 'encryption', Bus: 'encryption' };
export function mediatekImageHashes(catalog) {
  return new Set((catalog?.identities ?? []).filter(i => i.family === 'mediatek')
    .flatMap(i => i.revisions.flatMap(r => r.packages.map(p => p.image_sha256 ?? p.sha256))));
}

export function validateCapabilityRecord(record, expectedSha, version, producerSha) {
  if (record?.schema !== 1 || record.input_sha256 !== expectedSha || record.producer_version !== version
      || (producerSha && record.producer_sha256 !== producerSha))
    throw new Error(`Stale or mismatched Modify capability record: ${expectedSha}`);
  if (!['supported', 'unchanged', 'unsupported'].includes(record.status)) throw new Error('Unknown Modify capability status');
  if (record.status === 'unsupported') {
    if (record.report !== null || typeof record.reason !== 'string') throw new Error('Unsupported firmware needs an explicit reason');
  } else {
    if (!/^[a-f0-9]{64}$/.test(record.output_sha256 ?? '')) throw new Error('Missing generated-image checksum');
    for (const key of new Set(Object.values(FEATURE_SETTING))) {
      const setting = record.report?.boot_settings?.[key];
      if (typeof setting?.supported !== 'boolean' || !Array.isArray(setting.choices)) throw new Error(`Missing Modify setting: ${key}`);
    }
  }
}

export function validateCapabilityCoverage(catalog, manifest, index, { producerSha } = {}) {
  if (manifest?.schema !== 1 || manifest.producer?.tool !== 'freemkv-fw'
      || !/^[a-f0-9]{64}$/.test(manifest.producer.sha256 ?? '') || !Array.isArray(manifest.images))
    throw new Error('Missing or invalid Modify capability manifest');
  if (producerSha && producerSha !== manifest.producer.sha256) throw new Error('Stale Modify producer');
  const expected = mediatekImageHashes(catalog), records = new Map();
  for (const record of manifest.images) {
    const sha = record.input_sha256;
    if (!expected.has(sha) || records.has(sha)) throw new Error(`Unexpected/duplicate Modify record: ${sha}`);
    validateCapabilityRecord(record, sha, manifest.producer.version, manifest.producer.sha256);
    records.set(sha, record);
  }
  if (records.size !== expected.size) throw new Error('Modify capability coverage does not match the published catalog');
  if (index) {
    const seen = new Set();
    for (const model of index) for (const version of model.versions ?? []) {
      const record = records.get(version.sha256);
      if (!record) throw new Error(`Index has no Modify record: ${version.sha256}`);
      seen.add(version.sha256);
      const modifiable = record.status === 'supported' && record.flash_admitted === true;
      if (version.modifiable !== modifiable) throw new Error(`Index disagrees with Modify: ${version.sha256}`);
      for (const [feature, setting] of Object.entries(FEATURE_SETTING)) {
        const actual = version.features?.find(f => f.key === feature)?.ok ?? false;
        const declared = modifiable && record.report.boot_settings[setting].supported;
        if (actual !== declared) throw new Error(`Index feature disagrees with Modify: ${version.sha256}/${feature}`);
      }
    }
    if (seen.size !== expected.size) throw new Error('Index silently omitted published MediaTek firmware');
  }
  return records;
}
