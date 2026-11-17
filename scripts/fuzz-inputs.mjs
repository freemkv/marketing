import assert from 'node:assert/strict';
import path from 'node:path';
import { safePath, safeFilename, validateManifest } from './firmware-release.mjs';
import { normalizeHardware, compareRevision } from '../src/lib/finder.mjs';

const iterations = Number(process.argv[2] ?? 100000);
let seed = Number(process.argv[3] ?? 20261117) >>> 0;
const initialSeed = seed;
const random = () => {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return seed >>> 0;
};
const alphabet = 'abcXYZ019._%-/\\: +\0\n<>é';
const text = () => Array.from({ length: random() % 80 }, () => alphabet[random() % alphabet.length]).join('');
const sign = value => Math.sign(value) || 0;
let accepted = 0;
for (let i = 0; i < iterations; i++) {
  const a = text(), b = text();
  if (safePath(a)) {
    const resolved = path.resolve('/quality-fuzz-root', a);
    assert.ok(resolved.startsWith('/quality-fuzz-root/'), JSON.stringify({ seed: initialSeed, i, a }));
    assert.ok(!a.includes('\\') && !a.includes('\0'));
    accepted++;
  }
  if (safeFilename(a)) assert.equal(path.basename(a), a);
  assert.equal(normalizeHardware(normalizeHardware(a)), normalizeHardware(a));
  assert.equal(sign(compareRevision(a, b)), -sign(compareRevision(b, a)) || 0);
  const sha = 'a'.repeat(64);
  const object = { key: i % 2 ? a : `fw/pioneer/${sha}.tar`, filename: a, sha256: sha, bytes: random() % 100000000 };
  const manifest = { format: 'freemkv-firmware-publish-v2', objects: [object] };
  try {
    validateManifest(manifest);
  } catch {
    continue;
  }
  assert.ok(safePath(object.key) && safeFilename(object.filename));
  assert.ok(Number.isSafeInteger(object.bytes) && object.bytes > 0 && object.bytes <= 64 * 1024 * 1024);
}
console.log(JSON.stringify({ seed: initialSeed, iterations, acceptedPaths: accepted, status: 'passed' }));
