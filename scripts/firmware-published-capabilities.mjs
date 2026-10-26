// Ask the real modifier about every published input; never silently filter one.
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { buildEntry, sortEntries, buildFeaturesDoc, buildIndex, buildSummary } from './firmware-features.mjs';
import { validateCapabilityRecord, validateCapabilityCoverage } from '../src/lib/firmware-capabilities.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
function tool(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', error = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Timed out: ${binary}`)); }, 120000);
    child.stdout.on('data', data => { out += data; });
    child.stderr.on('data', data => { error += data; });
    child.on('error', e => { clearTimeout(timeout); reject(e); });
    child.on('close', code => { clearTimeout(timeout); resolve({ code, out, error }); });
  });
}

export async function generatePublished({ hoard, fw, flash, outDir, eligible, hardware = new Set(), log = () => {} }) {
  if (!flash) throw new Error('The publisher requires the matching Flash admission tool');
  const binary = await fs.readFile(fw);
  const versionResult = await tool(fw, ['--version']);
  if (versionResult.code !== 0) throw new Error('Modify producer did not report its version');
  const version = versionResult.out.trim().split(/\s+/).at(-1);
  const flashSha = sha(await fs.readFile(flash));
  const producer = { tool: 'freemkv-fw', version, sha256: sha(binary) };
  const identities = (await readJson(path.join(hoard, 'index/identities.json'))).identities;
  const candidates = new Map();
  for (const identity of identities) if (identity.family === 'mediatek') for (const image of identity.images ?? []) {
    if (!eligible.has(image.sha256) || candidates.has(image.sha256)) continue;
    if (!['oem', 'dump'].includes(image.category)) throw new Error(`Published image is not OEM/community: ${image.sha256}`);
    candidates.set(image.sha256, image);
  }
  if (candidates.size !== eligible.size) throw new Error('Published firmware is missing from the hoard');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'modify-capabilities-'));
  const entries = [], images = [];
  try {
    for (const hash of [...eligible].sort()) {
      const source = candidates.get(hash), file = path.join(hoard, source.path);
      const original = await fs.readFile(file);
      if (sha(original) !== hash) throw new Error(`Hoard source hash mismatch: ${hash}`);
      const query = await tool(fw, ['capabilities', file]);
      if (query.code !== 0) throw new Error(`Modify capability query failed: ${hash}: ${query.error}`);
      const record = JSON.parse(query.out);
      record.producer_sha256 = producer.sha256;
      validateCapabilityRecord(record, hash, version, producer.sha256);
      let base = null;
      record.flash_admitted = false;
      if (record.status === 'supported') {
        const output = path.join(temp, `${hash}.bin`);
        const build = await tool(fw, ['modify', file, output, '--json', '--audit']);
        if (build.code !== 0 || sha(await fs.readFile(output)) !== record.output_sha256)
          throw new Error(`Modify preview and real build disagree: ${hash}: ${build.error}`);
        const admission = await tool(flash, ['--why', file, output]);
        record.flash_admitted = admission.code === 0 && admission.out.trim() === 'admitted';
        record.flash_reason = record.flash_admitted ? null : admission.out.trim() || admission.error.trim();
        if (record.flash_admitted) {
          const strict = await tool(fw, ['modify', file, path.join(temp, `${hash}.base.bin`), '--base', '--json']);
          if (strict.code === 0) base = JSON.parse(strict.out);
        }
      }
      if (sha(await fs.readFile(file)) !== hash) throw new Error(`Modify changed the source input: ${hash}`);
      const identity = record.identity;
      if (!identity?.model || !identity.revision) throw new Error(`Modify did not identify a published image: ${hash}`);
      const report = record.report ?? {
        engine: identity.chip, chip: identity.chip, vendor: identity.vendor, model: identity.model,
        rev: identity.revision, vendor_specific: identity.variant, media: '', levers: [],
      };
      const entry = buildEntry({ sha: hash, bytes: original.length, create: report,
        modifiable: record.status === 'supported' && record.flash_admitted, base, hardwareVerified: hardware.has(hash) });
      entry.capability_status = record.status;
      entry.unavailable_reason = record.reason;
      entries.push(entry); images.push(record);
      log(`${images.length}/${eligible.size}: ${identity.model} ${identity.revision}: ${record.status}`);
    }
    const sorted = sortEntries(entries), index = buildIndex(sorted);
    if (sha(await fs.readFile(flash)) !== flashSha) throw new Error('Flash producer changed during generation');
    const manifest = { schema: 1, producer, flash: { sha256: flashSha }, images };
    const catalog = { identities: [{ family: 'mediatek', revisions: [{ packages: [...eligible].map(image_sha256 => ({ image_sha256 })) }] }] };
    validateCapabilityCoverage(catalog, manifest, index, { producerSha: sha(await fs.readFile(fw)) });
    const doc = buildFeaturesDoc(sorted);
    doc.note = `Exact-image capabilities from freemkv-fw ${version}; every published MediaTek hash was queried and every supported output built, audited and checked by Flash. Unsupported inputs are retained explicitly.`;
    await fs.mkdir(outDir, { recursive: true });
    for (const [name, value] of Object.entries({ 'firmware-capabilities.json': manifest, 'firmware-features.json': doc, 'firmware-index.json': index }))
      await fs.writeFile(path.join(outDir, name), JSON.stringify(value, null, 2) + '\n');
    await fs.writeFile(path.join(outDir, 'firmware-features-summary.md'), buildSummary(doc));
    return { entries: sorted, excluded: {}, manifest };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
