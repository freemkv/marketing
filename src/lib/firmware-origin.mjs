// The site may expose only byte-traceable OEM files and explicitly approved dumps.
export function validateOriginDetails(catalog) {
  const hash = (value, size) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${size}}$`).test(value);
  for (const identity of catalog.identities ?? []) for (const revision of identity.revisions ?? []) for (const pkg of revision.packages ?? []) {
    const expected = [pkg.image_sha256, pkg.intermediate_sha256, pkg.kernel_sha256, pkg.normal_sha256].filter(Boolean).sort();
    const details = pkg.origin_details;
    if (!Array.isArray(details) || !details.length || JSON.stringify(details.map(d => d.firmware?.sha256).sort()) !== JSON.stringify(expected)) throw new Error(`Missing or mismatched Origin Details: ${pkg.filename}`);
    for (const origin of details) {
      if (!['oem', 'dump'].includes(origin.category)) throw new Error(`Ineligible firmware origin: ${pkg.filename}`);
      if (origin.category === 'dump' && (origin.approval?.allow_publish !== true || origin.approval?.allow_hoard !== true)) throw new Error(`Unapproved dump: ${pkg.filename}`);
      if (!Array.isArray(origin.originals) || !origin.originals.length) throw new Error(`Missing original source: ${pkg.filename}`);
      for (const file of [...origin.originals, origin.firmware]) {
        if (!file?.filename || !hash(file.sha256, 64) || !hash(file.md5, 32) || !Number.isSafeInteger(file.bytes) || file.bytes <= 0) throw new Error(`Invalid origin file: ${pkg.filename}`);
      }
    }
  }
}

// Public names omit internal restoration tooling; the source ledger stays intact.
export function publicOriginDetails(details = []) {
  const filename = value => String(value ?? '').replace(/^unmk[_ -]+/i, '');
  const file = value => {
    const {source_kind, ...rest} = value;
    return {...rest, filename: filename(value.filename),
      ...(value.filenames ? {filenames: [...new Set(value.filenames.map(filename))]} : {}),
      ...(source_kind && source_kind !== 'unmk-restored' ? {source_kind} : {})};
  };
  return details.map(({source_kind, originals, firmware, ...rest}) => ({...rest,
    ...(source_kind && source_kind !== 'unmk-restored' ? {source_kind} : {}),
    originals: originals.map(file), firmware: file(firmware)}));
}
