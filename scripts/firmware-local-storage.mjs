// Local-only storage receipts never travel in firmware transport archives.
// Inputs stay in Git LFS; the transport is the sole local payload copy once
// preparation finishes. Publication restores it automatically if needed.
import { promises as fs, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RECEIPT = 'local-storage.json';
const FORMAT = 'freemkv-local-storage-v1';
const script = fileURLToPath(new URL('./firmware-release.mjs', import.meta.url));
const json = async p => JSON.parse(await fs.readFile(p, 'utf8'));
async function digest(file) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest('hex'), bytes };
}
function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error(`${cmd} failed: ${result.error ?? result.status}`);
}
function repository(extractor) {
  const result = spawnSync('git', ['-C', extractor, 'rev-parse', '--show-toplevel'], {encoding:'utf8'});
  return result.status === 0;
}
export function withStorageLease(extractor, [cmd, prefix], args, work) {
  if (process.env.FWEXT_STORAGE_LEASE || !repository(extractor)) return work();
  return run(cmd, [...prefix, 'storage', 'run', '--', process.execPath, script, ...args], { cwd: path.resolve(extractor) });
}
async function receipt(directory) {
  try {
    const row = await json(path.join(directory, RECEIPT));
    if (row.format !== FORMAT || !/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isSafeInteger(row.bytes)) throw new Error('Invalid local storage receipt');
    return row;
  } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function verifyArchive(directory, row) {
  // Derive the path locally, never trust a path supplied in a receipt.
  const archive = path.resolve(directory) + '.tar.gz';
  const actual = await digest(archive);
  if (actual.sha256 !== row.sha256 || actual.bytes !== row.bytes) throw new Error('Local transport archive changed; keeping firmware payloads');
  return archive;
}
async function removePayloads(directory) {
  const manifest = await json(path.join(directory, 'publish-manifest.json'));
  const files = [];
  for (const o of manifest.objects) {
    if (!/^(?:fw\/[a-z]+\/[a-f0-9]{64}\.(?:bin|tar)|pioneer\/[A-Za-z0-9._%/-]+\.tar|MT(?:1939|1959)\/[A-Za-z0-9._%-]+\.bin)$/.test(o.key) || o.key.split('/').some(s => s === '..' || s === '.')) throw new Error('Unsafe cleanup key');
    const file = path.join(directory, 'payloads', o.key);
    try {
      let current = directory;
      for (const part of ['payloads', ...o.key.split('/')]) {
        current = path.join(current, part);
        if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Unsafe cleanup payload path');
      }
      const info = await fs.lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unsafe cleanup payload');
      const actual = await digest(file);
      if (actual.sha256 !== o.sha256 || actual.bytes !== o.bytes) throw new Error('Changed staged payload; cleanup refused');
      files.push(file);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  // Validate every candidate before removing the first byte.
  for (const file of files) await fs.unlink(file);
  return files.length;
}
export async function cleanPreparedStorage({ extractor, hoard, directory, command: [cmd, prefix] }) {
  const archive = path.resolve(directory) + '.tar.gz';
  const row = { format: FORMAT, ...await digest(archive) };
  await fs.writeFile(path.join(directory, RECEIPT), JSON.stringify(row));
  // Standalone non-Git fixtures/hoards remain supported. Only Git-backed
  // inputs have the remote durability contract required for automatic eviction.
  if (repository(extractor)) run(cmd, [...prefix, 'storage', 'clean', '--hoard', hoard], {cwd:extractor});
  await verifyArchive(directory, row);
  const count = await removePayloads(directory);
  console.log(`Released ${count} staged payloads; transport retained at ${archive}`);
}
export async function restorePreparedPayloads(directory, extract) {
  const row = await receipt(directory);
  if (!row) return;
  const archive = await verifyArchive(directory, row);
  const scratch = `${path.resolve(directory)}.restore-${process.pid}`;
  try {
    await extract(archive, scratch);
    const payloads = path.join(scratch, 'payloads');
    try { await fs.cp(payloads, path.join(directory, 'payloads'), {recursive:true, force:false, errorOnExist:false}); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  } finally { await fs.rm(scratch, {recursive:true, force:true}); }
}
export async function cleanPublishedStorage(directory) {
  const row = await receipt(directory);
  const archive = row ? await verifyArchive(directory, row) : null;
  const count = await removePayloads(directory);
  if (archive) {
    await fs.unlink(archive);
    await fs.unlink(path.join(directory, RECEIPT));
  }
  console.log(`Released ${count} published local firmware payloads`);
}

// Transfer the only remaining local copy to the existing draft-release
// workflow. Read it back and hash it before deleting it; no CI polling.
export async function submitPreparedStorage(directory, tag, { upload, download } = {}) {
  const row = await receipt(directory);
  if (!row) throw new Error('submit requires a locally prepared transport archive');
  const archive = await verifyArchive(directory, row);
  if (typeof tag !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(tag) || tag.includes('..')) throw new Error('Invalid release tag');
  await upload(tag, archive);
  const actual = await download(tag);
  if (actual.sha256 !== row.sha256 || actual.bytes !== row.bytes) throw new Error('Uploaded transport verification failed; local archive retained');
  await cleanPublishedStorage(directory);
}
