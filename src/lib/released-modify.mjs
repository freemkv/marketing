// Public capability claims must come from the actual downloadable Modify build.
export function validateReleasedModify(manifest, release) {
  const producer = manifest?.producer;
  if (release?.draft || release?.prerelease || !/^v\d+\.\d+\.\d+$/.test(release?.tag_name ?? ''))
    throw new Error('Modify requires a published stable release');
  if (producer?.tool !== 'freemkv-fw' || producer.version !== release.tag_name.slice(1))
    throw new Error(`Modify capability version ${producer?.version ?? 'missing'} does not match released ${release.tag_name}`);
  if (!/^[a-f0-9]{64}$/.test(producer.sha256 ?? '')) throw new Error('Missing Modify producer checksum');
  const asset = release.assets?.find(asset =>
    /^freemkv-fw-cli-(aarch64|x86_64|armv7)-(linux|macos|windows)(\.exe)?$/.test(asset.name ?? '')
    && asset.digest === `sha256:${producer.sha256}`);
  if (!asset) throw new Error('Modify capability producer is not a published CLI asset of the released app; regenerate with the released executable');
  return asset.name;
}
