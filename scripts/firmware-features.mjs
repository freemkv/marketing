// Regenerates the MediaTek firmware data the site ships:
//   src/data/firmware-features.json, src/data/firmware-index.json,
//   src/data/firmware-features-summary.md
// from the firmware-extractor hoard plus the freemkv-fw modify engine. Run it BEFORE
// `firmware-release.mjs prepare` (see scripts/firmware-release.md).
//
//   node scripts/firmware-features.mjs <hoard> --fw /path/to/freemkv-fw
//        --flash /path/to/freemkv-crossflash --eligible-catalog src/data/finder-catalog.json
//        [--out-dir src/data] [--hardware-verified allowlist.json] [--jobs 8]
//
// The binaries may also come from FREEMKV_FW and FREEMKV_CROSSFLASH.
// `--eligible-catalog` keeps only hashes in the existing MediaTek catalogue.
// `--hardware-verified` names a JSON
// array of sha256 hashes proven on real hardware; by default there is none, so
// every entry is "build-verified". Nothing is hardware-proven by this script.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Eligibility (the owner's rule). A MediaTek image is listed iff ALL hold:
//   (a) identities.json images[].mediatek.patched is not true (MK-patched images
//       are excluded; unMK images count as OEM only when fully restored),
//   (b) no source name that produced it (sources.json extraction.image -> names)
//       contains "omnidrive" (case-insensitive),
//   (c) it is not a fragment (mediatek.fragment),
//   (d) it is not on scripts/firmware-mediatek-exclusions.json (sha-bound,
//       with the reason it is not an OEM image),
//   (e) it is not a raw drive read (boot page equal to its 0x10000 mirror),
//   (f) `freemkv-fw verify` passes every integrity region (a partial MK
//       removal leaves a region that no longer verifies),
//   (g) `freemkv-fw modify --json` reports the image's identity (model and
//       revision), whether or not it can modify it,
//   (h) no other listed image has the same bytes apart from the
//       downgrade-enable byte (0x1EC056); of such a pair, the one with vendor
//       updater provenance is listed.
//
// Modifiable: `freemkv-fw modify` (the exact command a user runs) succeeds and
// applies at least one change. A modifiable image shows the "Modifiable" pill
// and leads to the modify page; any other listed image leads to the flash page,
// like Pioneer. Only a modifiable image that also builds a strict freemkv base
// (`modify --base`) carries base facts and a build-verified confidence.
// ---------------------------------------------------------------------------
export function metadataExclusion(image, names = [], excluded = new Set()) {
  const mt = image?.mediatek ?? {};
  if (mt.patched === true) return 'patched';
  if (names.some(n => /omnidrive/i.test(n))) return 'omnidrive';
  if (mt.fragment) return 'fragment';
  if (excluded.has(image?.sha256)) return 'excluded';
  return null;
}

// A drive read returns the boot mirror (0x10000) in place of the boot page.
export const BOOT_PAGE_LEN = 0x400, BOOT_MIRROR = 0x10000;
export const isDriveRead = bytes =>
  bytes.length >= BOOT_MIRROR + BOOT_PAGE_LEN &&
  bytes.subarray(0, BOOT_PAGE_LEN).equals(bytes.subarray(BOOT_MIRROR, BOOT_MIRROR + BOOT_PAGE_LEN));

// freemkv keeps the OEM build code; inspect the embedded handler identity too.
export const isFreemkvFirmware = bytes => bytes.includes(Buffer.from('freemkv'));

// The downgrade-enable byte is outside the integrity table; images that differ
// only there are the same firmware.
export const DE_OFFSET = 0x1EC056;
export function deMaskedSha(bytes) {
  const copy = Buffer.from(bytes);
  if (copy.length > DE_OFFSET) copy[DE_OFFSET] = 0;
  return createHash('sha256').update(copy).digest('hex');
}

// Provenance from a vendor updater: a member extracted from an archive or
// installer that is not a downgrade-enabled pack, a drive dump or an unMK file.
const NOT_VENDOR = /(^|[/:_ -])(DE_|DE-firmware-pack|Downgrade Enabled|dump|unMK)/i;
export const hasVendorProvenance = (names = []) => names.some(n => n.includes('::') && !NOT_VENDOR.test(n));

// One image per DE-masked content: vendor provenance first, then lowest sha.
export function dedupeByDeMask(items) {
  const best = new Map();
  for (const it of items) {
    const cur = best.get(it.masked);
    const rank = x => (x.vendor ? 0 : 1);
    if (!cur || rank(it) < rank(cur) || (rank(it) === rank(cur) && it.sha < cur.sha)) best.set(it.masked, it);
  }
  const kept = new Set([...best.values()].map(x => x.sha));
  return { kept: items.filter(x => kept.has(x.sha)), dropped: items.filter(x => !kept.has(x.sha)) };
}
export const appliedLevers = report => (report?.levers ?? []).filter(l => l.outcome === 'Applied');
export const hasAppliedLever = report => appliedLevers(report).length > 0;

// ---------------------------------------------------------------------------
// Per-image capabilities come from the same boot_settings.supported values
// consumed by Modify. Lineage is metadata only and never grants a feature.
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
export const LINEAGE_NEW = 'MT1959-lineage', LINEAGE_CLASSIC = 'MT1939-classic';
export function lineageOf(engine, levers = []) {
  if (engine === 'MT1959') return LINEAGE_NEW;
  const speed = levers.find(l => l.id === 'Speed');
  return speed && (speed.outcome === 'Applied' || speed.outcome === 'AlreadyPresent') ? LINEAGE_NEW : LINEAGE_CLASSIC;
}
const CAPABILITY = { Speed: 'speed', Region: 'region', UHD: 'unrestricted', BD: 'unrestricted', HRL: 'hrl', AKE: 'encryption', Bus: 'encryption' };
export function featuresFor(report) {
  for (const key of new Set(Object.values(CAPABILITY))) {
    if (typeof report?.boot_settings?.[key]?.supported !== 'boolean') {
      throw new Error(`Modify capability report is missing boot_settings.${key}.supported`);
    }
  }
  return FLAGS.map(f => ({ ...f, ok: report.boot_settings[CAPABILITY[f.key]].supported }));
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

export function buildEntry({ sha, bytes, create, modifiable = true, base = null, hardwareVerified = false }) {
  const model = modelOf(create.model);
  const lineage = modifiable ? lineageOf(create.engine, create.levers) : null;
  const bf = base?.base_facts ?? null;
  return {
    sha256: sha,
    bytes,
    src: srcOf(create.engine, model, sha),
    engine: create.engine,
    // The chip generation is the banner chip (`create.chip`), kept distinct from
    // `engine` (the code-layout/lineage name). Older engines without a `chip`
    // field fall back to the engine name.
    chip: create.chip ?? create.engine,
    brand: brandOf(sha, create.vendor),
    vendor: create.vendor,
    model,
    rev: create.rev,
    media: create.media,
    variant: create.vendor_specific,
    modifiable,
    base_ok: Boolean(bf),
    base_only: false,
    confidence: !bf ? null : hardwareVerified ? 'hardware-verified' : 'build-verified',
    advertised: modifiable ? 'features' : 'stock',
    features: modifiable ? featuresFor(create) : [],
    boot_support: modifiable ? Object.fromEntries(Object.entries(create.boot_settings).map(([key, value]) => [key, value.supported])) : null,
    base_facts: bf && {
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
  const perFlag = Object.fromEntries(FLAGS.map(f => [f.name, entries.filter(e => e.features.find(x => x.key === f.key)?.ok).length]));
  const modifiable = entries.filter(e => e.modifiable).length;
  const hw = entries.filter(e => e.confidence === 'hardware-verified').length;
  return {
    note: `Per-firmware feature availability over the full ${entries.length}-entry eligible corpus. Each image's feature bits come from \`freemkv-fw modify --json\` boot_settings.supported, the same capability report used by Modify. Hardware family, engine lineage and native media support never imply an available modification. Regenerate with ${SCRIPT} — do not hand-edit.`,
    flags: FLAGS.map(f => f.key),
    counts: { total: entries.length, base_only: 0, feature_bearing: modifiable, stock_only: entries.length - modifiable, hardware_verified: hw, build_verified: entries.filter(e => e.confidence === 'build-verified').length },
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
        file: e.r2_key, sha256: e.sha256, brand: e.brand, chipset: e.chip, media: e.media, variant: e.variant,
        confidence: e.confidence, baseOnly: e.base_only, advertised: e.advertised, modifiable: e.modifiable,
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
    `Regenerated by \`${SCRIPT}\` over the ${counts.total}-entry eligible corpus. Per-feature availability is taken from each exact image's Modify boot-settings capability report. Lineage does not grant features. Do not hand-edit.`,
    '',
    `- images: **${counts.total}**   modifiable: **${counts.feature_bearing}**   stock only (flash as-is): **${counts.stock_only}**`,
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
    ...images.map(e => `| ${e.engine} | ${e.brand} | ${e.model} | ${e.rev} | ${e.advertised} | ${e.confidence === 'hardware-verified' ? 'HW' : e.confidence ? 'build' : '-'} | ${FLAGS.map(f => (e.features.find(x => x.key === f.key)?.ok ? 'yes' : '-')).join(' | ')} |`),
  ];
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Hoard + engine.
// ---------------------------------------------------------------------------
const readJson = async p => JSON.parse(await fs.readFile(p, 'utf8'));

export const EXCLUSIONS = path.join(SITE, 'scripts/firmware-mediatek-exclusions.json');
export async function loadExclusions(file = EXCLUSIONS) {
  const rows = await readJson(file);
  if (!Array.isArray(rows)) throw new Error(`${file}: not a JSON array`);
  for (const r of rows) {
    if (!/^[0-9a-f]{64}$/.test(r?.sha256 ?? '') || !String(r?.reason ?? '').trim()) throw new Error(`${file}: every row needs a sha256 and a reason`);
  }
  return new Set(rows.map(r => r.sha256));
}

export async function loadCandidates(hoard, exclusions = new Set()) {
  const ids = (await readJson(path.join(hoard, 'index/identities.json'))).identities;
  const sources = (await readJson(path.join(hoard, 'index/sources.json'))).sources;
  const names = new Map();
  for (const s of sources) {
    names.set(s.sha256, [...(s.names ?? []), ...(s.inbound_paths ?? []),
      ...(s.legacy_paths ?? []), ...(s.evidence ?? []).map(e => e.ref ?? '')]);
  }
  const seen = new Map(), excluded = {};
  for (const id of ids) {
    if (id.family !== 'mediatek') continue;
    for (const image of id.images ?? []) {
      if (seen.has(image.sha256)) continue;
      const imageNames = [...new Set([image.sha256, ...(image.sources ?? [])]
        .flatMap(sha => names.get(sha) ?? []))];
      const why = metadataExclusion(image, imageNames, exclusions);
      if (why) { excluded[why] = (excluded[why] ?? 0) + 1; seen.set(image.sha256, null); continue; }
      seen.set(image.sha256, { sha: image.sha256, file: path.join(hoard, image.path), vendor: hasVendorProvenance(imageNames) });
    }
  }
  return { candidates: [...seen.values()].filter(Boolean), excluded };
}

function runTool(tool, args) {
  return new Promise(resolve => {
    const p = spawn(tool, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => (out += d));
    p.on('error', e => resolve({ code: -1, out: '', error: e }));
    p.on('close', code => resolve({ code, out }));
  });
}
const parse = s => { try { return JSON.parse(s); } catch { return null; } };

// Runs the engine for one candidate. `run(args)` is injectable for tests.
export async function evaluate(cand, run, tmp, hardware = new Set(), flash = null) {
  const raw = await fs.readFile(cand.file);
  if (isFreemkvFirmware(raw)) return { reason: 'freemkv-patched' };
  if (isDriveRead(raw)) return { reason: 'drive-read' };
  if ((await run(['verify', cand.file])).code !== 0) return { reason: 'integrity' };
  // freemkv-fw reports the lever outcomes even when it refuses to modify.
  const c = await run(['modify', '--json', cand.file, path.join(tmp, `${cand.sha.slice(0, 16)}.out.bin`)]);
  const create = parse(c.out);
  if (!create?.model || !create?.rev) return { reason: 'no-identity' };
  let modifiable = c.code === 0 && hasAppliedLever(create);
  // A feature is advertised only when the exact generated image is accepted
  // by the same offline admission gate used by freemkv-flash.
  if (modifiable && flash) {
    const output = path.join(tmp, `${cand.sha.slice(0, 16)}.out.bin`);
    const admitted = await flash(['--why', cand.file, output]);
    modifiable = admitted.code === 0 && admitted.out.trim() === 'admitted';
  }
  let base = null;
  if (modifiable) {
    const b = await run(['modify', '--base', '--json', cand.file, path.join(tmp, `${cand.sha.slice(0, 16)}.base.bin`)]);
    base = b.code === 0 ? parse(b.out) : null;
  }
  const entry = buildEntry({ sha: cand.sha, bytes: raw.length, create, modifiable, base, hardwareVerified: hardware.has(cand.sha) });
  return { entry, masked: deMaskedSha(raw), vendor: !!cand.vendor, sha: cand.sha };
}

export async function generate({ hoard, fw, flash, outDir, eligible = null, hardware = new Set(), jobs = 8, exclusions, log = () => {} }) {
  const { candidates, excluded } = await loadCandidates(hoard, exclusions ?? await loadExclusions());
  const admitted = eligible ? candidates.filter(candidate => eligible.has(candidate.sha)) : candidates;
  if (eligible) excluded['not-flash-admitted'] = candidates.length - admitted.length;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'firmware-features-'));
  try {
    const run = args => runTool(fw, args);
    const flashRun = flash ? args => runTool(flash, args) : null;
    const results = new Array(admitted.length);
    let next = 0;
    await Promise.all(Array.from({ length: jobs }, async () => {
      while (next < admitted.length) { const i = next++; results[i] = await evaluate(admitted[i], run, tmp, hardware, flashRun); }
    }));
    for (const r of results) if (r.reason) excluded[r.reason] = (excluded[r.reason] ?? 0) + 1;
    const { kept, dropped } = dedupeByDeMask(results.filter(r => r.entry));
    if (dropped.length) excluded['de-duplicate'] = dropped.length;
    const entries = sortEntries(kept.map(r => r.entry));
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

// Feature evaluation reads firmware images, while the catalogue addresses TARs.
export function eligibleImageHashes(catalog) {
  return new Set((catalog.identities ?? []).filter(i => i.family === 'mediatek')
    .flatMap(i => (i.revisions ?? []).flatMap(r => r.packages ?? [])
      .map(p => p.image_sha256 ?? p.sha256)));
}

async function main(argv) {
  const a = { jobs: 8, outDir: path.join(SITE, 'src/data'), fw: process.env.FREEMKV_FW, flash: process.env.FREEMKV_CROSSFLASH };
  let hardwareFile, eligibleCatalog, hoard;
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--fw') a.fw = argv[++i];
    else if (x === '--flash') a.flash = argv[++i];
    else if (x === '--out-dir') a.outDir = path.resolve(argv[++i]);
    else if (x === '--hardware-verified') hardwareFile = argv[++i];
    else if (x === '--eligible-catalog') eligibleCatalog = argv[++i];
    else if (x === '--jobs') a.jobs = Number(argv[++i]);
    else if (x.startsWith('-')) throw new Error(`unknown option ${x}`);
    else hoard = x;
  }
  if (!hoard || !a.fw || !a.flash) throw new Error('usage: firmware-features.mjs <hoard> --fw <freemkv-fw> --flash <freemkv-crossflash> [--eligible-catalog FILE] [--out-dir D] [--hardware-verified FILE] [--jobs N]');
  const hardware = new Set(hardwareFile ? await readJson(hardwareFile) : []);
  const catalog = eligibleCatalog ? await readJson(eligibleCatalog) : null;
  const eligible = catalog ? eligibleImageHashes(catalog) : null;
  await generate({ hoard: path.resolve(hoard), fw: a.fw, flash: a.flash, outDir: a.outDir, eligible, hardware, jobs: a.jobs, log: m => console.log(m) });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
}
