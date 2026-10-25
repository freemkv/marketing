// Bounded manifest metadata only; firmware bytes travel inside the report ZIP.
export function firmwareInputs(value = []) {
  if (!Array.isArray(value) || value.length > 128) throw new Error('Invalid firmware input metadata.');
  return value.map(v => {
    if (!v || !['target', 'current', 'current-capture'].includes(v.role) || typeof v.available !== 'boolean'
        || typeof v.operation !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(v.operation)) throw new Error('Invalid firmware input.');
    const result = {operation: v.operation, role: v.role, available: v.available};
    for (const key of ['filename', 'member', 'archive_path', 'missing_reason']) {
      if (v[key] == null) continue;
      if (typeof v[key] !== 'string' || v[key].length > 1024 || (key === 'archive_path' && /[\u0000-\u001f\u007f]/.test(v[key]))) throw new Error('Invalid firmware input text.');
      result[key] = v[key];
    }
    if (v.sha256 != null) {
      if (!/^[0-9a-f]{64}$/.test(v.sha256)) throw new Error('Invalid firmware checksum.');
      result.sha256 = v.sha256;
    }
    if (v.bytes != null) {
      if (!Number.isSafeInteger(v.bytes) || v.bytes < 0 || v.bytes > 64 * 1024 * 1024) throw new Error('Invalid firmware size.');
      result.bytes = v.bytes;
    }
    if (v.available && (!result.sha256 || result.bytes == null || !/^firmware\/[0-9a-f]{64}\/[^/\\]+$/.test(result.archive_path ?? ''))) throw new Error('Missing firmware attachment metadata.');
    return result;
  });
}
export function firmwareInputText(value) {
  const inputs = firmwareInputs(value);
  if (!inputs.length) return 'Firmware inputs: no input files were available for this report.';
  return 'Firmware inputs (inside the report ZIP):\n' + inputs.map(v =>
    `${v.role} — ${v.filename ? JSON.stringify(v.filename) : 'not captured'} [operation ${v.operation}]\n` +
    (v.available ? `  ${v.bytes} bytes; SHA-256 ${v.sha256}\n  ZIP: ${v.archive_path}${v.member ? `\n  Selected member: ${JSON.stringify(v.member)}` : ''}`
      : `  Unavailable: ${JSON.stringify(v.missing_reason || 'Exact input snapshot was not captured.')}`)).join('\n\n');
}
