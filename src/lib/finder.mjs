// Firmware finder data model and search. Pure functions only: the page script
// and node tests import this module; nothing here touches the DOM.
//
// Identity = family + hardware + destination ID (e.g. pioneer:9201:ID43).
// Names (retail, OEM labels, drive-reported strings) are aliases that point at
// one or more identities. A drive only takes firmware for its own identity;
// other IDs on the same hardware are listed as cross-flash targets.

export const DISCORD_URL = 'https://discord.gg/yu7xMGTyek';

const PIONEER_KERNEL_FIRST = { 'source-contained': 0, 'carried-forward': 1, 'direct-match': 2, 'release-chain': 3, 'normal-only': 4 };
export function compact(text) {
  return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

export function normalizeHardware(value) {
  const s = String(value ?? '').trim().toUpperCase();
  const m = s.match(/^(?:SAT|RS)[\s_-]*([0-9A-F]{4})$/);
  return m ? m[1] : s;
}

export function normalizeDestination(value) {
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return '';
  if (/^\d{1,3}$/.test(s)) return 'ID' + s.padStart(2, '0');
  return s.replace(/^ID[\s_-]+/, 'ID');
}

function revisionParts(rev) {
  const m = String(rev ?? '').match(/(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Numeric revision order ("1.02" < "1.10"); suffixes such as EU are ignored. */
export function compareRevision(a, b) {
  const x = revisionParts(a), y = revisionParts(b);
  if (x && y) {
    if (x[0] !== y[0]) return x[0] - y[0];
    if (x[1] !== y[1]) return x[1] - y[1];
    return 0;
  }
  if (x) return 1;
  if (y) return -1;
  return String(a).localeCompare(String(b));
}

function titleBrand(brand) {
  const s = String(brand || '').trim();
  if (!s) return '';
  if (/^(HP|LG|ASUS|TDK|NEC|TEAC|PLDS|HL-DT-ST)$/i.test(s)) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function roles(components) {
  return (Array.isArray(components) ? components : [])
    .map(c => (typeof c === 'string' ? c : c?.role))
    .map(r => (r === 'normal' ? 'main' : r))
    .filter(Boolean);
}

function mediatekExtras(v) {
  if (!v) return {};
  const out = {};
  for (const k of ['features', 'modifiable', 'confidence', 'baseOnly', 'media', 'variant', 'chipset', 'brand'])
    if (v[k] !== undefined && v[k] !== '') out[k] = v[k];
  return out;
}

function pushUnique(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

/**
 * Normalise the published catalogues into one finder model.
 *  - catalog: finder-catalog.json v2 from `fwext publish-catalog` (may be empty)
 *  - mediatek / pioneer: the v1 site indexes; entries whose package sha256 is
 *    already in the v2 catalog are skipped, the rest are adapted so nothing
 *    currently downloadable disappears (e.g. MediaTek files without hoard bytes).
 */
export function buildFinderData({ catalog = null, mediatek = [], pioneer = [] } = {}) {
  const identities = new Map();
  const aliases = new Map(); // compact|kind -> alias
  const mtkBySha = new Map();
  for (const m of mediatek) for (const v of m.versions ?? []) if (v.sha256) mtkBySha.set(v.sha256, { ...v, brand: v.brand || m.brand });

  function identity(key, init) {
    if (!identities.has(key)) identities.set(key, {
      key, family: init.family, hardware: init.hardware, destination: init.destination || 'GENERAL',
      platforms: [], embeddedModels: [], brands: [], revisions: [], candidates: [], missing: [],
      familyId: null, uhd: false,
    });
    return identities.get(key);
  }
  function addAlias(display, kind, keys, evidence = []) {
    const c = compact(display);
    if (!c || !keys.length) return;
    const id = c + '|' + kind;
    const row = aliases.get(id) ?? { display: String(display).trim(), compact: c, kind, targets: [], evidence: [] };
    for (const k of keys) pushUnique(row.targets, k);
    for (const e of evidence) if (row.evidence.length < 3 && !row.evidence.some(x => x.ref === e.ref)) row.evidence.push({ source: e.source ?? '', ref: e.ref ?? '' });
    aliases.set(id, row);
  }
  function addPackage(ident, revision, pkg) {
    let row = ident.revisions.find(r => r.revision === revision);
    if (!row) { row = { revision, packages: [] }; ident.revisions.push(row); }
    if (!row.packages.some(p => p.sha256 === pkg.sha256)) row.packages.push(pkg);
    else {
      const existing = row.packages.find(p => p.sha256 === pkg.sha256);
      for (const a of pkg.advertisedVersions ?? []) pushUnique(existing.advertisedVersions, a);
    }
    pushUnique(ident.brands, titleBrand(pkg.brand));
    pushUnique(ident.embeddedModels, pkg.embeddedModel);
  }

  const v2Shas = new Set();
  if (catalog && Array.isArray(catalog.identities)) {
    for (const src of catalog.identities) {
      const ident = identity(src.key, { family: src.family, hardware: src.hardware, destination: src.destination });
      for (const p of src.platforms ?? []) pushUnique(ident.platforms, p);
      for (const m of src.embedded_models ?? []) pushUnique(ident.embeddedModels, m);
      for (const r of src.revisions ?? []) {
        if (!r.packages?.length) { pushUnique(ident.missing, r.revision); continue; }
        for (const p of r.packages) {
          v2Shas.add(p.sha256);
          const isPioneer = p.packageType === 'pioneer-installer';
          if (isPioneer && p.family_id) ident.familyId ??= p.family_id;
          if (isPioneer && p.is_uhd === true) ident.uhd = true;
          addPackage(ident, r.revision, {
            sha256: p.sha256, bytes: p.bytes, key: p.key, filename: p.filename,
            packageType: p.packageType || (src.family === 'mediatek' ? 'mediatek-image' : 'image'),
            components: roles(p.components), selection: p.selection ?? null,
            uhd: p.is_uhd === true, kernelRevision: p.kernel_revision ?? null, normalSha256: p.normal_sha256 ?? null,
            advertisedVersions: [...(p.advertised_versions ?? [])], generatedDate: p.generated_date ?? null,
            embeddedModel: p.embedded_model ?? null, brand: p.brand ?? null, buildId: p.build_id ?? null,
            provenance: typeof p.provenance === 'string' ? p.provenance : null,
            chipset: isPioneer ? 'Pioneer' : (src.platforms?.[0] ?? null),
            modifiable: isPioneer ? false : Boolean(mtkBySha.get(p.sha256)?.modifiable),
            ...(isPioneer ? {} : mediatekExtras(mtkBySha.get(p.sha256))),
          });
        }
      }
      // Known-but-missing revisions, if the catalogue carries them.
      for (const m of src.missing_revisions ?? []) pushUnique(ident.missing, typeof m === 'string' ? m : m?.revision);
      ident.candidates = (src.other_candidates ?? []).map(c => ({
        key: c.key, hardware: c.hardware, destination: c.destination,
        status: c.crossflash_status || 'untested', steps: c.steps ?? [], evidence: c.evidence ?? [],
        caution: c.caution ?? null, kernelDiff: kernelDiff(c.kernel_comparisons),
      }));
    }
    for (const a of catalog.aliases ?? []) {
      const keys = (a.targets ?? []).map(t => `${t.family}:${t.hardware}:${t.destination}`).filter(k => identities.has(k));
      for (const d of a.displays?.length ? a.displays : [a.display ?? a.name]) addAlias(d, a.kind || 'retail', keys, a.evidence ?? []);
    }
  }

  // v1 adapters for anything not already in the v2 catalogue.
  for (const m of pioneer) for (const v of m.versions ?? []) {
    if (!v.file || !v.sha256 || v2Shas.has(v.sha256)) continue;
    const hardware = normalizeHardware(v.hardware);
    const destination = normalizeDestination(v.destination || v.kernelVersion) || 'GENERAL';
    const key = `pioneer:${hardware}:${destination}`;
    const ident = identity(key, { family: 'pioneer', hardware, destination });
    pushUnique(ident.platforms, 'pioneer');
    addPackage(ident, v.embeddedRev || v.rev, {
      sha256: v.sha256, bytes: v.bytes ?? null, key: safeDecode(v.file), file: v.file,
      filename: v1Filename(v.embeddedModel || m.model, v.rev, v.sha256, 'tar'), packageType: 'pioneer-installer',
      components: roles(v.components), selection: v.selection ?? null, kernelRevision: v.kernelRev ?? null,
      normalSha256: v.normalSha256 ?? null, advertisedVersions: v.rev ? [v.rev] : [], generatedDate: v.generatedDate ?? null,
      embeddedModel: v.embeddedModel ?? null, brand: v.brand || m.brand, chipset: 'Pioneer', modifiable: v.modifiable === true,
      provenance: null,
    });
    addAlias(m.model, 'retail', [key]);
    if (v.embeddedModel) addAlias(v.embeddedModel, 'firmware', [key]);
  }
  for (const m of mediatek) for (const v of m.versions ?? []) {
    if (!v.file || !v.sha256 || v2Shas.has(v.sha256)) continue;
    const destination = /^[A-Z][A-Z0-9]\d{5}$/.test(v.variant || '') ? v.variant[0] : 'GENERAL';
    const hardware = m.model;
    const key = `mediatek:${hardware}:${destination}`;
    const ident = identity(key, { family: 'mediatek', hardware, destination });
    pushUnique(ident.platforms, v.chipset);
    addPackage(ident, v.embeddedRev || v.rev, {
      sha256: v.sha256, bytes: v.bytes ?? null, key: safeDecode(v.file), file: v.file,
      filename: safeDecode(v.file.split('/').pop()), packageType: 'mediatek-image', components: [],
      advertisedVersions: v.rev ? [v.rev] : [], embeddedModel: m.model, provenance: null,
      ...mediatekExtras({ ...v, brand: v.brand || m.brand }),
    });
    addAlias(m.model, 'retail', [key]);
    if (m.brand) addAlias(`${m.brand} ${m.model}`, 'retail', [key]);
  }

  // Embedded model strings are drive-reported names; make them searchable.
  for (const ident of identities.values()) {
    for (const model of ident.embeddedModels) addAlias(model, 'firmware', [ident.key]);
    ident.revisions.sort((a, b) => compareRevision(b.revision, a.revision));
    for (const r of ident.revisions) r.packages.sort(packageOrder);
    ident.missing = ident.missing.filter(rev => !ident.revisions.some(r => r.revision === rev));
  }
  return { identities: [...identities.values()], aliases: [...aliases.values()] };
}

/** Same shape as the extractor's catalogue filenames: MODEL_REV_sha8.ext */
export function v1Filename(model, rev, sha, ext) {
  const seg = x => String(x ?? '').trim().replace(/[^A-Za-z0-9._-]/g, '_');
  return [model, rev].filter(Boolean).map(seg).join('_') + '_' + String(sha).slice(0, 8) + '.' + ext;
}

/** Smallest measured Kernel difference between two editions, for "likely" evidence. */
function kernelDiff(comparisons) {
  if (!Array.isArray(comparisons) || !comparisons.length) return null;
  const best = comparisons.reduce((a, b) => (b.differing_bytes < a.differing_bytes ? b : a));
  return { bytes: best.differing_bytes, size: best.decoded_bytes, kinds: [...new Set((best.regions ?? []).map(r => r.kind))], likely: comparisons.some(c => c.likely) };
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function packageOrder(a, b) {
  const ka = PIONEER_KERNEL_FIRST[a.selection] ?? 5, kb = PIONEER_KERNEL_FIRST[b.selection] ?? 5;
  return ka - kb || String(a.sha256).localeCompare(String(b.sha256));
}

/** Build lookup tables once; searches then stay cheap for thousands of rows. */
export function indexFinder(data) {
  const byKey = new Map(data.identities.map(i => [i.key, i]));
  const byHardware = new Map();
  for (const i of data.identities) {
    const h = compact(i.hardware);
    if (!byHardware.has(h)) byHardware.set(h, []);
    byHardware.get(h).push(i);
  }
  const namesByKey = new Map();
  for (const a of data.aliases) for (const k of a.targets) {
    if (!namesByKey.has(k)) namesByKey.set(k, []);
    namesByKey.get(k).push(a);
  }
  return { ...data, byKey, byHardware, namesByKey };
}

const hasKernelAndNormal = pkg => pkg.components.includes('kernel') && pkg.components.includes('main');

/**
 * Cross flash: other Pioneer editions in the same hardware family (fwext
 * `family_id`), with every revision. A revision is `complete` when a package
 * ships both Kernel and Normal; without a Kernel it cannot be cross-flashed.
 * MediaTek has no cross flash. Returns [{ identity, revisions: [{ revision, complete }] }].
 */
export function crossflashTargets(data, identity) {
  if (identity.family !== 'pioneer' || !identity.familyId) return [];
  return data.identities
    .filter(o => o !== identity && o.family === 'pioneer' && o.familyId === identity.familyId)
    .map(o => ({ identity: o, revisions: o.revisions.map(r => ({ revision: r.revision, complete: r.packages.some(hasKernelAndNormal) })) }))
    .filter(t => t.revisions.length);
}

export function componentsLabel(components) {
  if (!components?.length || !components.every(r => r === 'kernel' || r === 'main')) return null;
  return [components.includes('kernel') && 'Kernel', components.includes('main') && 'Normal'].filter(Boolean).join(' + ');
}

/** Hero counts: hosted packages by chipset. */
// What users count: unique drive model + firmware version pairs, as listed
// in the model dropdown (a model shares firmware with others, so this is
// larger than the number of distinct files).
export function modelVersionSummary(page) {
  const byChip = {};
  let total = 0;
  for (const model of page.models) {
    const seen = new Set();
    for (const [v] of model.v) {
      const version = page.versions[v];
      const key = version.r;
      if (seen.has(key)) continue;
      seen.add(key);
      total++;
      const ident = page.identities[version.i];
      const chip = ident.pio ? 'Pioneer' : (ident.chip || 'MediaTek');
      byChip[chip] = (byChip[chip] || 0) + 1;
    }
  }
  return { total, byChip: Object.entries(byChip).sort((a, b) => b[1] - a[1]) };
}

export function hostedSummary(data) {
  const byChip = {};
  let total = 0;
  for (const i of data.identities) for (const r of i.revisions) for (const p of r.packages) {
    total++;
    const chip = p.chipset || (i.family === 'pioneer' ? 'Pioneer' : i.platforms[0] || 'Other');
    byChip[chip] = (byChip[chip] || 0) + 1;
  }
  return { total, byChip: Object.entries(byChip).sort((a, b) => b[1] - a[1]) };
}


// ---------------------------------------------------------------------------
// Page data for /firmware/find/: model names -> versions -> packages, with
// human labels only (no identity keys, board strings or placeholder IDs).

// Alias kinds shown as drive model names, best first. File/release names are
// search terms only.
const MEDIA_PREFIX = /^(?:BD-?RE|BD-?RW|BD-?ROM|BD-?R|DVD-?RW|DVD-?RAM|DVD-?ROM|BDDVDRW|CDDVDW|DVDRW)\s+(?=\S)/i;
const NAME_RANK = { legacy: 0, retail: 1, inquiry: 2, 'release-note': 3, oem: 4 };
const OEM_NAMES = { ASUS: 'ASUS', BUFFALO: 'Buffalo', HP: 'HP', TDK: 'TDK', TEAC: 'TEAC', MEMOREX: 'Memorex', MEDION: 'Medion', SONYDT: 'Sony' };

/** Human label for an identity's destination: "ID43", an OEM name, or "" when unknown. */
export function destinationLabel(identity) {
  const d = String(identity.destination ?? '');
  if (identity.family === 'pioneer' && /^ID\d+$/.test(d)) return d;
  return OEM_NAMES[d.replace(/\d+$/, '')] ?? '';
}

function baseBrand(identity) {
  if (identity.family === 'pioneer') return 'Pioneer';
  const first = String(identity.hardware).split(' ')[0];
  return /^HL-?DT-?ST$/i.test(first) ? 'LG' : titleBrand(first);
}

/** Heading a version is listed under on the card: the OEM if known, the
 * maker for its own (GENERAL) builds, otherwise "Other editions". */
export function versionGroup(identity) {
  const d = destinationLabel(identity);
  if (d && !/^ID\d+$/.test(d)) return d;
  if (identity.family === 'pioneer' || String(identity.destination) === 'GENERAL') return baseBrand(identity);
  return 'Other editions';
}

/** Brand shown in the card title: the OEM edition if known, else the maker. */
export function identityBrand(identity) {
  const d = destinationLabel(identity);
  return d && !/^ID\d+$/.test(d) ? d : baseBrand(identity);
}

function hardwareLabel(identity) {
  return /^[0-9A-F]{4}$/.test(identity.hardware) ? 'SAT ' + identity.hardware : identity.hardware;
}

/** Short, human "where it comes from" line for a package. */

function bytesLabel(n) {
  if (!Number.isFinite(n)) return '';
  return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
}

function contentsLabel(pkg) {
  if (pkg.packageType !== 'pioneer-installer') return 'Firmware image';
  const c = componentsLabel(pkg.components);
  if (!c) return 'Package';
  return pkg.kernelRevision && pkg.components.includes('kernel') ? c.replace('Kernel', `Kernel ${pkg.kernelRevision}`) : c;
}

function chips(identity, pkg) {
  const out = [];
  if (identity.family === 'pioneer') {
    out.push(['Pioneer'], ['Hardware ' + hardwareLabel(identity)]);
    if (identity.destination) out.push([/^ID\d+$/.test(identity.destination)
      ? identity.destination : 'Destination ' + identity.destination]);
    const c = componentsLabel(pkg.components);
    if (c) out.push([c]);
    if (pkg.uhd) out.push(['UHD capable']);
    return out;
  }
  const chip = pkg.chipset || identity.platforms.find(p => /^MT/.test(p));
  if (chip) out.push([chip]);
  if (pkg.media) out.push([pkg.media]);
  if (pkg.variant) out.push([pkg.variant, 'drive-fact-variant', 'Region/SKU code']);
  if (pkg.confidence === 'hardware-verified') out.push(['Hardware-verified', 'drive-fact-verified', 'Proven on real hardware']);
  else if (pkg.confidence === 'build-verified') out.push(['Build-verified', 'drive-fact-buildver', 'Strict build + KAT verified; not yet flashed & tested on hardware']);
  return out;
}

const norm = t => String(t ?? '').toLowerCase().replace(/[_-]+/g, ' ');
const searchText = list => [...new Set(list.filter(Boolean).flatMap(t => [norm(t), compact(t).toLowerCase()]))].join(' ');

/**
 * Everything the finder page ships, built once at build time.
 *  packages[]:   {s sha256, f filename, k object key (public builds only), b size, src, built, contents, chips}
 *  identities[]: {n model name, brand, d OEM/ID label or '', pio, t search text, v [version idx newest first], x [[identity idx, status]]}
 *  versions[]:   {i identity idx, r revision, p [package idx, preferred first], mod, features, baseOnly}
 *  models[]:     {m name, t search text, v [[version idx, label]]}
 * `legacy` is the old site index rows ({model, brand, versions:[{sha256}]}): their
 * model names stay listed, mapped by package hash onto catalogue identities.
 */
export function finderPageData(data, { legacy = [], keys = true } = {}) {
  const idIdx = new Map(data.identities.map((i, n) => [i.key, n]));
  const shaKey = new Map(), normalKey = new Map();
  for (const i of data.identities) for (const r of i.revisions) for (const p of r.packages) {
    shaKey.set(p.sha256, i.key);
    if (p.normalSha256) normalKey.set(p.normalSha256, i.key);
  }

  const packages = [], versions = [];
  const identities = data.identities.map((i, n) => {
    const v = [];
    for (const r of i.revisions) {
      const p = r.packages.map(pkg => {
        packages.push({ s: pkg.sha256, f: String(pkg.filename ?? '').replace(/_GENERAL(?=_)/, ''), ...(keys ? { k: pkg.file ?? pkg.key } : {}), b: bytesLabel(pkg.bytes),
          built: pkg.generatedDate || '', contents: contentsLabel(pkg), chips: chips(i, pkg) });
        return packages.length - 1;
      });
      const best = r.packages[0];
      versions.push({ i: n, r: r.revision, p, ...(best.modifiable ? { mod: 1 } : {}), ...(best.baseOnly ? { baseOnly: 1 } : {}),
        ...(best.features?.length ? { features: best.features.map(f => ({ name: f.name, ok: f.ok })) } : {}) });
      v.push(versions.length - 1);
    }
    return { i, out: { n: '', brand: identityBrand(i), d: destinationLabel(i), g: versionGroup(i), pio: i.family === 'pioneer' ? 1 : 0, v } };
  });

  // Model names -> identity keys.
  const names = new Map(); // compact -> {m, rank, keys:Set}
  const addName = (display, rank, ks) => {
    const c = compact(display);
    if (!c || !ks.length) return;
    const row = names.get(c) ?? { m: String(display).trim(), rank, keys: new Set() };
    if (rank < row.rank) { row.m = String(display).trim(); row.rank = rank; }
    for (const k of ks) row.keys.add(k);
    names.set(c, row);
  };
  for (const row of legacy) {
    // A package gains a new hash when its Kernel changes; its Normal does not.
    const ks = [...new Set((row.versions ?? []).map(v => shaKey.get(v.sha256) ?? normalKey.get(v.normalSha256)).filter(Boolean))];
    addName(row.model, NAME_RANK.legacy, ks);
  }
  const terms = new Map(data.identities.map(i => [i.key, [hardwareLabel(i), i.hardware, destinationLabel(i), identityBrand(i), ...i.platforms, ...i.embeddedModels]]));
  for (const a of data.aliases) {
    const ks = a.targets.filter(k => idIdx.has(k));
    for (const k of ks) terms.get(k).push(a.display);
    // Drive-reported names lead with the media type ("BDRE BU40N" on HP
    // units); the model is what follows.
    const display = a.kind === 'inquiry' ? String(a.display).replace(MEDIA_PREFIX, '') : a.display;
    if (a.kind in NAME_RANK) addName(display, NAME_RANK[a.kind], ks);
  }
  // Every identity needs at least one listed name.
  const named = new Set([...names.values()].flatMap(r => [...r.keys]));
  for (const i of data.identities) if (!named.has(i.key)) addName(i.embeddedModels[0] || hardwareLabel(i), 9, [i.key]);

  // Display name per identity: best-ranked name that lists it.
  const best = new Map();
  for (const row of [...names.values()].sort((a, b) => a.rank - b.rank || a.m.localeCompare(b.m)))
    for (const k of row.keys) if (!best.has(k)) best.set(k, row.m);
  for (const { i, out } of identities) { out.n = best.get(i.key); out.t = searchText(terms.get(i.key)); }

  // Cross flash: [name, uhd, rows] per target model name (editions sharing a name are
  // merged), rows = [identity index, version index, incomplete] with one row per
  // revision, newest first; a complete edition wins a shared revision.
  for (const { i, out } of identities) {
    const byName = new Map();
    for (const t of crossflashTargets(data, i)) {
      const n = idIdx.get(t.identity.key);
      const o = identities[n].out;
      const g = byName.get(o.n) ?? byName.set(o.n, { uhd: 0, rows: new Map() }).get(o.n);
      if (t.identity.uhd) g.uhd = 1;
      for (const vi of o.v) {
        const r = t.revisions.find(r => r.revision === versions[vi].r);
        const prev = g.rows.get(versions[vi].r);
        if (r && (!prev || (prev[2] && r.complete))) g.rows.set(versions[vi].r, [n, vi, r.complete ? 0 : 1]);
      }
    }
    out.x = [...byName].map(([name, g]) => [name, g.uhd,
      [...g.rows.values()].sort((a, b) => versions[b[1]].r.localeCompare(versions[a[1]].r, undefined, { numeric: true }))]);
  }

  const models = [...names.values()].sort((a, b) => a.m.localeCompare(b.m)).map(row => {
    const ids = [...row.keys].map(k => data.identities[idIdx.get(k)]);
    ids.sort((a, b) => (destinationLabel(a) ? 1 : 0) - (destinationLabel(b) ? 1 : 0) || destinationLabel(a).localeCompare(destinationLabel(b)) ||
      a.hardware.localeCompare(b.hardware));
    const rows = ids.flatMap(i => identities[idIdx.get(i.key)].out.v.map(v => ({ v, i })));
    const labels = rows.map(({ v, i }) => versions[v].r + (destinationLabel(i) ? ` (${destinationLabel(i)})` : ''));
    // Same label from different editions: add the hardware/chipset, then a counter.
    const extra = ({ i }) => i.family === 'pioneer' ? hardwareLabel(i) : (packages[versions[rows[0].v].p[0]] && (i.platforms.find(p => /^MT/.test(p)) || ''));
    const dupes = l => labels.filter(x => x === l).length > 1;
    labels.forEach((l, n) => { if (dupes(l) && extra(rows[n])) labels[n] = `${l} · ${extra(rows[n])}`; });
    const seen = {};
    labels.forEach((l, n) => { seen[l] = (seen[l] ?? 0) + 1; if (dupes(l)) labels[n] = `${l} · ${seen[l]}`; });
    return { m: row.m, t: searchText([row.m, ...new Set(ids.map(identityBrand))]), v: rows.map(({ v }, n) => [v, labels[n]]) };
  });
  return { packages, versions, identities: identities.map(x => x.out), models };
}
