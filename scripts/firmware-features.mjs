// Regenerates the MediaTek firmware data the site ships:
//   src/data/firmware-features.json, src/data/firmware-index.json,
//   src/data/firmware-features-summary.md
// from the firmware-extractor hoard plus the freemkv-fw modify engine. Run it BEFORE
// `firmware-release.mjs prepare` (see scripts/firmware-release.md).
//
//   node scripts/firmware-features.mjs <hoard> [--fw /path/to/freemkv-fw]
//        [--out-dir src/data] [--hardware-verified allowlist.json] [--jobs 8]
//
// The binary may also come from FREEMKV_FW. `--hardware-verified` names a JSON
// array of sha256 hashes proven on real hardware; by default there is none, so
// every entry is "build-verified". Nothing is hardware-proven by this script.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Eligibility (the owner's rule). A MediaTek image is listed iff ALL hold:
//   (a) identities.json images[].mediatek.patched is not true (MK-patched images
//       are excluded; unMK images count as OEM),
//   (b) no source name that produced it (sources.json extraction.image -> names)
//       contains "omnidrive" (case-insensitive),
//   (c) it is not a fragment (mediatek.fragment),
//   (d) `freemkv-fw create --json` applies at least one lever.
// ---------------------------------------------------------------------------
export function metadataExclusion(image, names = []) {
  const mt = image?.mediatek ?? {};
  if (mt.patched === true) return 'patched';
  if (names.some(n => /omnidrive/i.test(n))) return 'omnidrive';
  if (mt.fragment) return 'fragment';
  return null;
}
export const appliedLevers = report => (report?.levers ?? []).filter(l => l.outcome === 'Applied');
export const hasAppliedLever = report => appliedLevers(report).length > 0;

// ---------------------------------------------------------------------------
// Lever / engine -> lineage -> 7 advertised flags.
//
// The site advertises per ENGINE LINEAGE (firmware CHANGELOG [0.8.1]), not per
// image lever outcome:
//   MT1959-lineage: all 7 flags (Speed, Region, UHD, BD, HRL, AKE, Bus).
//   MT1939-classic: Region, HRL, AKE, Bus only; Speed/UHD/BD are architecturally
//                   absent.
// Lineage is derived from the engine and the Speed lever:
//   engine MT1959                                     -> MT1959-lineage
//   engine MT1939, Speed lever Applied/AlreadyPresent -> MT1959-lineage
//   engine MT1939, Speed lever anything else          -> MT1939-classic
// (MT1939 images that carry the Speed gate are the 1959 code lineage; classic
// MT1939 firmware has no Speed gate, so the lever reports SignatureNotFound.)
// This reproduces the committed data for all 124 distinct images.
// ---------------------------------------------------------------------------
export const FLAGS = [
  { key: 'Speed', name: 'Speed' },
  { key: 'Region', name: 'Region-free' },
  { key: 'UHD', name: 'UHD' },
  { key: 'BD', name: 'BD' },
  { key: 'HRL', name: 'HRL Bypass' },
  { key: 'AKE', name: 'AKE Bypass' },
  { key: 'Bus', name: 'Bus Decrypt' },
];
const CLASSIC_FLAGS = new Set(['Region', 'HRL', 'AKE', 'Bus']);
export const LINEAGE_NEW = 'MT1959-lineage', LINEAGE_CLASSIC = 'MT1939-classic';

export function lineageOf(engine, levers = []) {
  if (engine === 'MT1959') return LINEAGE_NEW;
  const speed = levers.find(l => l.id === 'Speed');
  return speed && (speed.outcome === 'Applied' || speed.outcome === 'AlreadyPresent') ? LINEAGE_NEW : LINEAGE_CLASSIC;
}
export function featuresFor(lineage) {
  return FLAGS.map(f => ({ key: f.key, name: f.name, ok: lineage === LINEAGE_NEW || CLASSIC_FLAGS.has(f.key) }));
}

// ---------------------------------------------------------------------------
// Identity: model, brand, src.
// ---------------------------------------------------------------------------
// Model = last whitespace token of the engine's model string ("BD-RE  BU40N" ->
// "BU40N"), except a trailing single-letter board suffix is dropped ("BC-12B1ST
// b" -> "BC-12B1ST"), and MODEL_ALIASES folds known suffixed spellings.
export const MODEL_ALIASES = { 'BW-16D1H-U': 'BW-16D1H' };
export function modelOf(modelString) {
  let t = String(modelString).trim().split(/\s+/);
  if (t.length > 1 && /^[a-z]$/.test(t[t.length - 1])) t = t.slice(0, -1);
  const m = t[t.length - 1];
  return MODEL_ALIASES[m] ?? m;
}
// Brand: ASUS vendor -> ASUS; vendor "hp" -> HP; everything else (HL-DT-ST,
// "hp HLDS") is LG hardware. BRAND_OVERRIDES (by sha256 prefix) holds the
// rebrands the vendor string cannot tell (Buffalo, HP-labelled BU40N, dynabook).
// Two committed rows deliberately stay LG although their hoard destination says
// BUFFALO/HP (920a89f9 BU12, d1e4d3d7 BU50N BW51); they are kept to reproduce
// the published data.
export const BRAND_OVERRIDES = {
  '14d86e99': 'Buffalo', '58203b53': 'Buffalo',
  '3b9dd9b4': 'HP', 'c68cd76b': 'HP',
  'c328b656': 'dynabook',
};
// Extra brands an image is sold under (same bytes). Only affects the index
// group label: e2406018 is the LG WH16NS58 and also Sony's BWU-100A.
export const ALSO_SOLD_AS = { 'e2406018': ['Sony'] };
export function brandOf(sha, vendor) {
  const o = BRAND_OVERRIDES[sha.slice(0, 8)];
  if (o) return o;
  if (/^asus$/i.test(vendor)) return 'ASUS';
  if (/^hp$/i.test(vendor)) return 'HP';
  return 'LG';
}
export const srcOf = (engine, model, sha) => `/tmp/corpus_dw/${engine}_${model}_${sha.slice(0, 16)}.bin`;
export const r2KeyOf = (engine, model, rev, sha) => `${engine}/${model}_${rev}_${sha.slice(0, 8)}.bin`;

export function buildEntry({ sha, bytes, create, base, hardwareVerified = false }) {
  const model = modelOf(create.model);
  const lineage = lineageOf(create.engine, create.levers);
  const bf = base.base_facts;
  return {
    sha256: sha,
    bytes,
    src: srcOf(create.engine, model, sha),
    engine: create.engine,
    brand: brandOf(sha, create.vendor),
    vendor: create.vendor,
    model,
    rev: create.rev,
    media: create.media,
    variant: create.vendor_specific,
    base_ok: true,
    base_only: false,
    confidence: hardwareVerified ? 'hardware-verified' : 'build-verified',
    advertised: 'features',
    features: featuresFor(lineage),
    base_facts: {
      handler_va: bf.handler_va, boot_stub_va: bf.boot_stub_va, boot_init_site: bf.boot_init_site,
      de_off: bf.de_off, speed_gate: bf.speed_gate, region_emitter: bf.region_emitter,
      ake_gate: bf.ake_gate, uhd_stub_va: bf.uhd_stub_va, bd_stub_va: bf.bd_stub_va, hrl_sites: bf.hrl_sites,
    },
    r2_key: r2KeyOf(create.engine, model, create.rev, sha),
    lineage,
  };
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function sortEntries(entries) {
  return [...entries].sort((a, b) => cmp(a.engine, b.engine) || cmp(a.model, b.model) || cmp(a.rev, b.rev) || cmp(a.sha256, b.sha256));
}

// ---------------------------------------------------------------------------
// Output documents.
// ---------------------------------------------------------------------------
const SCRIPT = 'scripts/firmware-features.mjs';
export function buildFeaturesDoc(entries) {
  const lin = l => entries.filter(e => e.lineage === l).length;
  const nNew = lin(LINEAGE_NEW), nClassic = lin(LINEAGE_CLASSIC);
  const perFlag = Object.fromEntries(FLAGS.map(f => [f.name, entries.filter(e => e.features.find(x => x.key === f.key).ok).length]));
  const hw = entries.filter(e => e.confidence === 'hardware-verified').length;
  return {
    note: `Per-firmware feature availability over the full ${entries.length}-entry OEM corpus. Identity/chipset/media/base_facts are machine-derived from \`freemkv-fw create --base --json\`; per-feature \`ok\` bits are set by ENGINE LINEAGE (golden KAT) per the firmware CHANGELOG [0.8.1]: MT1959-lineage advertises all 7 flags (${nNew} images); MT1939-classic advertises Region/HRL/AKE/Bus only (Speed/UHD/BD architecturally absent, ${nClassic} images). Regenerate with ${SCRIPT} — do not hand-edit.`,
    flags: FLAGS.map(f => f.key),
    counts: { total: entries.length, base_only: 0, feature_bearing: entries.length, hardware_verified: hw, build_verified: entries.length - hw },
    per_flag: perFlag,
    images: entries,
  };
}

export function buildIndex(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.model)) groups.set(e.model, []);
    groups.get(e.model).push(e);
  }
  return [...groups.keys()].sort(cmp).map(model => {
    const es = groups.get(model).sort((a, b) => cmp(a.rev, b.rev) || cmp(a.sha256, b.sha256));
    const brands = new Set(es.map(e => e.brand));
    for (const e of es) for (const b of ALSO_SOLD_AS[e.sha256.slice(0, 8)] ?? []) brands.add(b);
    return {
      brand: [...brands].sort(cmp).join(' / '),
      model,
      ready: true,
      versions: es.map(e => ({
        rev: e.rev, embeddedRev: e.rev, advertisedVersion: '', hardware: '',
        file: e.r2_key, sha256: e.sha256, brand: e.brand, chipset: e.engine, media: e.media, variant: e.variant,
        confidence: e.confidence, baseOnly: e.base_only, advertised: e.advertised, modifiable: true,
        features: e.features,
      })),
    };
  });
}

export function buildSummary(doc) {
  const { counts, per_flag: pf, images } = doc;
  const lines = [
    '# freemkv firmware feature advertisement — summary',
    '',
    `Regenerated by \`${SCRIPT}\` over the ${counts.total}-entry OEM corpus. Per-feature availability is by ENGINE LINEAGE per the firmware CHANGELOG [0.8.1] (MT1959-lineage: all 7 flags · MT1939-classic: Region/HRL/AKE/Bus only — Speed/UHD/BD architecturally absent). Do not hand-edit.`,
    '',
    `- images (base-gated): **${counts.total}**`,
    `- feature-bearing: **${counts.feature_bearing}**   base-only (Identity/Save/Reset, features pending boot-bless): **${counts.base_only}**`,
    `- hardware-verified: **${counts.hardware_verified}**   build-verified: **${counts.build_verified}**`,
    '',
    'Feature availability across feature-bearing images:',
    '',
    '| Flag | Images |',
    '| --- | ---: |',
    ...Object.entries(pf).map(([k, v]) => `| ${k} | ${v} |`),
    '',
    `| Chip | Brand | Model | Rev | Advertised | Confidence | ${FLAGS.map(f => f.name).join(' | ')} |`,
    `| --- | --- | --- | --- | --- | --- | ${FLAGS.map(() => '---').join(' | ')} |`,
    ...images.map(e => `| ${e.engine} | ${e.brand} | ${e.model} | ${e.rev} | ${e.advertised} | ${e.confidence === 'hardware-verified' ? 'HW' : 'build'} | ${e.features.map(f => (f.ok ? 'yes' : '-')).join(' | ')} |`),
  ];
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Hoard + engine.
// ---------------------------------------------------------------------------
const readJson = async p => JSON.parse(await fs.readFile(p, 'utf8'));

export async function loadCandidates(hoard) {
  const ids = (await readJson(path.join(hoard, 'index/identities.json'))).identities;
  const sources = (await readJson(path.join(hoard, 'index/sources.json'))).sources;
  const names = new Map();
  for (const s of sources) {
    const k = s.extraction?.image;
    if (!k) continue;
    if (!names.has(k)) names.set(k, []);
    names.get(k).push(...(s.names ?? []));
  }
  const seen = new Map(), excluded = {};
  for (const id of ids) {
    if (id.family !== 'mediatek') continue;
    for (const image of id.images ?? []) {
      if (seen.has(image.sha256)) continue;
      const why = metadataExclusion(image, names.get(image.sha256) ?? []);
      if (why) { excluded[why] = (excluded[why] ?? 0) + 1; seen.set(image.sha256, null); continue; }
      seen.set(image.sha256, { sha: image.sha256, file: path.join(hoard, image.path) });
    }
  }
  return { candidates: [...seen.values()].filter(Boolean), excluded };
}

function runFw(fw, args) {
  return new Promise(resolve => {
    const p = spawn(fw, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => (out += d));
    p.on('error', e => resolve({ code: -1, out: '', error: e }));
    p.on('close', code => resolve({ code, out }));
  });
}
const parse = s => { try { return JSON.parse(s); } catch { return null; } };

// Runs the engine for one candidate. `run(args)` is injectable for tests.
export async function evaluate(cand, run, tmp, hardware = new Set()) {
  const c = await run(['create', '--json', cand.file, path.join(tmp, `${cand.sha.slice(0, 16)}.out.bin`)]);
  const create = c.code === 0 ? parse(c.out) : null;
  if (!create || !hasAppliedLever(create)) return { reason: 'no-applied-lever' };
  const b = await run(['create', '--base', '--json', cand.file, path.join(tmp, `${cand.sha.slice(0, 16)}.base.bin`)]);
  const base = b.code === 0 ? parse(b.out) : null;
  if (!base?.base_facts) return { reason: 'no-base' };
  const bytes = (await fs.stat(cand.file)).size;
  return { entry: buildEntry({ sha: cand.sha, bytes, create, base, hardwareVerified: hardware.has(cand.sha) }) };
}

export async function generate({ hoard, fw, outDir, hardware = new Set(), jobs = 8, log = () => {} }) {
  const { candidates, excluded } = await loadCandidates(hoard);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'firmware-features-'));
  try {
    const run = args => runFw(fw, args);
    const results = new Array(candidates.length);
    let next = 0;
    await Promise.all(Array.from({ length: jobs }, async () => {
      while (next < candidates.length) { const i = next++; results[i] = await evaluate(candidates[i], run, tmp, hardware); }
    }));
    for (const r of results) if (r.reason) excluded[r.reason] = (excluded[r.reason] ?? 0) + 1;
    const entries = sortEntries(results.filter(r => r.entry).map(r => r.entry));
    const doc = buildFeaturesDoc(entries);
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'firmware-features.json'), JSON.stringify(doc, null, 1));
    await fs.writeFile(path.join(outDir, 'firmware-index.json'), JSON.stringify(buildIndex(entries), null, 2) + '\n');
    await fs.writeFile(path.join(outDir, 'firmware-features-summary.md'), buildSummary(doc));
    log(`listed ${entries.length}; excluded ${JSON.stringify(excluded)}`);
    return { entries, excluded };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function main(argv) {
  const a = { jobs: 8, outDir: path.join(SITE, 'src/data'), fw: process.env.FREEMKV_FW };
  let hardwareFile, hoard;
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--fw') a.fw = argv[++i];
    else if (x === '--out-dir') a.outDir = path.resolve(argv[++i]);
    else if (x === '--hardware-verified') hardwareFile = argv[++i];
    else if (x === '--jobs') a.jobs = Number(argv[++i]);
    else if (x.startsWith('-')) throw new Error(`unknown option ${x}`);
    else hoard = x;
  }
  if (!hoard || !a.fw) throw new Error('usage: firmware-features.mjs <hoard> --fw <freemkv-fw> [--out-dir D] [--hardware-verified FILE] [--jobs N]  (or FREEMKV_FW=...)');
  const hardware = new Set(hardwareFile ? await readJson(hardwareFile) : []);
  await generate({ hoard: path.resolve(hoard), fw: a.fw, outDir: a.outDir, hardware, jobs: a.jobs, log: m => console.log(m) });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
}
