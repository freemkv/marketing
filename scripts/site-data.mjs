// Generate the release's website data from a published firmware stage with the
// exact release binaries. freemkv-firmware's QA runs this; the release then
// publishes QA's output unchanged, so no data is computed at release time.
//
//   node scripts/site-data.mjs --stage DIR --fw freemkv-fw --flash freemkv-crossflash --out DIR
//
// DIR (stage) is an extracted firmware stage: publish-manifest.json,
// finder-catalog.json and payloads/. Writes crossflash-links.json,
// firmware-capabilities.json, firmware-features.json, firmware-index.json and
// firmware-features-summary.md to --out. --cache keeps the route graph keyed by
// the crossflash binary and the exact package inventory, so a rerun (or a
// website-only fix) reuses it instead of recomputing it.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { crossflashGraph } from './firmware-crossflash-cache.mjs';
import { checkCrossflashLinks } from './firmware-release.mjs';
import { generate, eligibleImageHashes } from './firmware-features.mjs';

const exec = promisify(execFile);
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** A hoard view of the stage's MediaTek packages: each package's firmware.bin,
 *  checked against the package manifest, as the published (OEM) image. */
export async function stageHoard(stage, objects, dir) {
  const images = [];
  await fs.mkdir(path.join(dir, 'images'), { recursive: true });
  for (const object of objects.filter(o => o.family === 'mediatek')) {
    const archive = path.join(stage, 'payloads', object.key);
    const manifest = JSON.parse((await exec('tar', ['-xOf', archive, 'manifest.json'], { maxBuffer: 1 << 20 })).stdout);
    const component = manifest.components?.find(c => c.role === 'firmware');
    if (!component || manifest.format !== 'freemkv-mediatek-package') throw new Error(`Not a MediaTek firmware package: ${object.key}`);
    const { stdout } = await exec('tar', ['-xOf', archive, component.path], { encoding: 'buffer', maxBuffer: 1 << 26 });
    if (sha(stdout) !== component.sha256) throw new Error(`Package firmware hash mismatch: ${object.key}`);
    const file = path.join('images', `${component.sha256}.bin`);
    await fs.writeFile(path.join(dir, file), stdout);
    images.push({ sha256: component.sha256, path: file, category: 'oem' });
  }
  await fs.mkdir(path.join(dir, 'index'), { recursive: true });
  await fs.writeFile(path.join(dir, 'index/identities.json'),
    JSON.stringify({ identities: [{ family: 'mediatek', images }] }));
  return dir;
}

export async function siteData({ stage, fw, flash, out, cache, jobs = os.availableParallelism(), log = console.log }) {
  const manifest = await json(path.join(stage, 'publish-manifest.json'));
  const catalog = await json(path.join(stage, 'finder-catalog.json'));
  await fs.mkdir(out, { recursive: true });
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'site-data-'));
  try {
    const started = Date.now();
    const { graph } = await crossflashGraph({ engine: flash, root: path.join(stage, 'payloads'), objects: manifest.objects,
      cacheFile: cache ?? path.join(work, 'crossflash-cache.json'), concurrency: Math.min(16, Math.max(1, jobs)), onProgress: log });
    checkCrossflashLinks(graph, catalog);
    await fs.writeFile(path.join(out, 'crossflash-links.json'), JSON.stringify(graph, null, 2));
    log(`crossflash route graph: ${((Date.now() - started) / 1000).toFixed(0)}s`);
    const hoard = await stageHoard(stage, manifest.objects, path.join(work, 'hoard'));
    const featuresStarted = Date.now();
    await generate({ hoard, fw, flash, outDir: out, eligible: eligibleImageHashes(catalog), jobs, log });
    log(`Modify capabilities: ${((Date.now() - featuresStarted) / 1000).toFixed(0)}s`);
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const key = { '--stage': 'stage', '--fw': 'fw', '--flash': 'flash', '--out': 'out', '--cache': 'cache', '--jobs': 'jobs' }[argv[i]];
    if (!key) throw new Error(`unknown option ${argv[i]}`);
    a[key] = key === 'jobs' ? Number(argv[++i]) : path.resolve(argv[++i]);
  }
  if (!a.stage || !a.fw || !a.flash || !a.out) throw new Error('usage: site-data.mjs --stage DIR --fw BIN --flash BIN --out DIR [--cache FILE] [--jobs N]');
  await siteData(a);
}
