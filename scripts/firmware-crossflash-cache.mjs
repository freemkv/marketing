// Cache complete graphs only. Missing edges are proven refusals for the exact
// package bytes and executable that produced the graph, never guessed rules.
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const FORMAT = 'freemkv-crossflash-cache-v1';
const platforms = new Set(['pioneer', 'mediatek']);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sorted = items => [...items].sort((a, b) => a.key.localeCompare(b.key));

function validate(body) {
  if (body?.format !== FORMAT || !sha(body.engine) || !Array.isArray(body.inventory)) throw new Error('Invalid crossflash cache');
  const ids = new Set();
  for (const o of body.inventory) {
    if (!sha(o.sha256) || !platforms.has(o.family) || o.key !== `fw/${o.family}/${o.sha256}.tar` || ids.has(o.sha256)) throw new Error('Invalid cached inventory');
    ids.add(o.sha256);
  }
  const g = body.graph;
  if (g?.format !== 'freemkv-crossflash-links' || g.version !== 2) throw new Error('Invalid cached graph');
  for (const edges of [g.links, g.future, g.conditional ?? {}]) {
    if (!edges || typeof edges !== 'object' || Array.isArray(edges)) throw new Error('Invalid cached edges');
    for (const [from, to] of Object.entries(edges)) {
      if (!ids.has(from) || !Array.isArray(to) || new Set(to).size !== to.length || to.some(id => !ids.has(id) || id === from)) throw new Error('Invalid cached edge');
    }
  }
  const seen = new Set();
  for (const edges of [g.links, g.future, g.conditional ?? {}]) for (const [from, targets] of Object.entries(edges)) for (const to of targets) {
    const pair = `${from}:${to}`;
    if (seen.has(pair)) throw new Error('Conflicting cached edge');
    seen.add(pair);
  }
  return body;
}
export async function saveCrossflashCache(file, body) {
  validate(body);
  const raw = JSON.stringify(body);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify({ sha256: digest(raw), body }), { flag: 'wx', mode: 0o600 });
    await fs.rename(tmp, file);
  } finally { await fs.rm(tmp, { force: true }); }
}
export async function readCrossflashCache(file) {
  try {
    const doc = JSON.parse(await fs.readFile(file, 'utf8'));
    if (doc.sha256 !== digest(JSON.stringify(doc.body))) throw new Error('Crossflash cache checksum mismatch');
    return validate(doc.body);
  } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export function inventory(objects) {
  return sorted(objects.filter(o => platforms.has(o.family ?? o.key.split('/')[1]) && o.key.endsWith('.tar'))
    .map(o => ({ key: o.key, family: o.family ?? o.key.split('/')[1], sha256: o.sha256 })));
}
export async function engineHash(engine) { return digest(await fs.readFile(engine)); }

// Explicit migration for a stage already produced by a completed full scan.
// Callers must supply that scan's exact executable, not a version label.
export async function seedCrossflashCache({ file, engine, objects, graph, root }) {
  const entries = inventory(objects);
  for (const o of entries) if (digest(await fs.readFile(path.join(root, o.key))) !== o.sha256) throw new Error('Seed payload mismatch');
  await saveCrossflashCache(file, { format: FORMAT, engine: await engineHash(engine), inventory: entries, graph });
}

export async function crossflashGraph({ engine, root, objects, cacheFile, concurrency = 4, onProgress = console.log,
  run = async args => (await exec(engine, args, { maxBuffer: 1 << 28 })).stdout }) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('Invalid crossflash concurrency');
  const entries = inventory(objects), fingerprint = await engineHash(engine);
  // Even a cache hit is bound to the actual staged bytes.
  for (const o of entries) if (digest(await fs.readFile(path.join(root, o.key))) !== o.sha256) throw new Error('Crossflash payload mismatch');
  const previous = await readCrossflashCache(cacheFile);
  let graph, evaluated = 0;
  if (!previous || previous.engine !== fingerprint) {
    onProgress('Crossflash engine changed or no complete cache; running full validation');
    graph = JSON.parse(await run([path.join(root, 'fw')]));
  } else {
    const old = new Map(previous.inventory.map(o => [o.key, o.sha256]));
    const kept = new Set(entries.map(o => o.sha256));
    const added = new Set(entries.filter(o => old.get(o.key) !== o.sha256).map(o => o.sha256));
    graph = { ...previous.graph, links: {}, future: {}, conditional: {} };
    for (const kind of ['links', 'future', 'conditional']) for (const [from, to] of Object.entries(previous.graph[kind] ?? {})) {
      const targets = to.filter(id => kept.has(id));
      if (kept.has(from) && targets.length) graph[kind][from] = targets;
    }
    const jobs = [];
    for (const from of entries) for (const to of entries) {
      if (from.sha256 !== to.sha256 && from.family === to.family && (added.has(from.sha256) || added.has(to.sha256))) jobs.push([from, to]);
    }
    onProgress(`Crossflash: ${entries.length - added.size} unchanged packages; ${jobs.length} new directed pairs`);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const [from, to] = jobs[cursor++];
        const result = JSON.parse(await run(['--why', '--json', path.join(root, from.key), path.join(root, to.key)]));
        if (!['yes', 'conditional', 'soft_no', 'hard_no'].includes(result.status)) throw new Error('Invalid crossflash verdict');
        const kind = result.status === 'yes' ? 'links' : result.status === 'soft_no' ? 'future' : result.status === 'conditional' ? 'conditional' : null;
        if (kind) (graph[kind][from.sha256] ??= []).push(to.sha256);
        evaluated++;
      }
    }));
    for (const kind of ['links', 'future', 'conditional']) for (const targets of Object.values(graph[kind])) targets.sort();
  }
  if (await engineHash(engine) !== fingerprint) throw new Error('Crossflash executable changed during validation');
  graph.evaluated_packages = [...new Set(entries.map(o => o.sha256))].sort();
  graph.engine_sha256 = fingerprint;
  const body = { format: FORMAT, engine: fingerprint, inventory: entries, graph };
  await saveCrossflashCache(cacheFile, body);
  return { graph, evaluated };
}
