// Firmware finder data model and search. Pure functions only: the page script
// and node tests import this module; nothing here touches the DOM.
//
// Identity = family + hardware + destination ID (e.g. pioneer:9201:ID43).
// Names (retail, OEM labels, drive-reported strings) are aliases that point at
// one or more identities. A drive only takes firmware for its own identity;
// other IDs on the same hardware are offered separately as conversions.

export const DISCORD_URL = 'https://discord.gg/yu7xMGTyek';

const PIONEER_KERNEL_FIRST = { 'source-contained': 0, 'carried-forward': 1, 'normal-only': 2 };
const VENDORS = ['PIONEER', 'HL-DT-ST', 'HLDTST', 'ASUS', 'LITE-ON', 'LITEON', 'PLDS', 'TSSTCORP', 'PLEXTOR',
  'MATSHITA', 'OPTIARC', 'HP', 'BUFFALO', 'LG', 'SONY', 'TEAC', 'NEC', 'TDK', 'MEMOREX', 'LACIE', 'IODATA', 'I-O DATA'];
const DRIVE_TYPES = new Set(['BD-RW', 'BDRW', 'BD-RE', 'BDRE', 'BD-ROM', 'BDROM', 'DVD-RW', 'DVDRW', 'DVD+-RW',
  'DVD+RW', 'DVD-ROM', 'DVDROM', 'CD-RW', 'CDRW', 'DVDR', 'DVD-RAM']);
const MAX_SIMILAR = 25;
// Alias kinds that are names a drive was sold or published under (not file names).
const SOLD_AS = new Set(['retail', 'oem', 'release', 'inquiry']);
export const isSoldAs = alias => SOLD_AS.has(alias.kind);

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
          addPackage(ident, r.revision, {
            sha256: p.sha256, bytes: p.bytes, key: p.key, filename: p.filename,
            packageType: p.packageType || (src.family === 'mediatek' ? 'mediatek-image' : 'image'),
            components: roles(p.components), selection: p.selection ?? null,
            kernelRevision: p.kernel_revision ?? null, normalSha256: p.normal_sha256 ?? null,
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

/** Smaller payload for the page: drop fields the browser never reads. */
export function clientData(data) {
  const strip = o => Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length) && k !== 'normalSha256'));
  return {
    aliases: data.aliases.map(a => strip({ ...a, compact: undefined, evidence: a.evidence.slice(0, 1).map(e => ({ ref: e.ref })) })),
    identities: data.identities.map(i => ({
      ...i,
      revisions: i.revisions.map(r => ({ revision: r.revision, packages: r.packages.map(p => {
        const out = strip({ ...p, key: p.file ? undefined : p.key });
        if (out.features) out.features = out.features.map(f => ({ name: f.name, ok: f.ok }));
        return out;
      }) })),
    })),
  };
}

/** Restore what clientData() dropped. */
export function hydrate(data) {
  for (const a of data.aliases) { a.compact = compact(a.display); a.evidence ??= []; a.targets ??= []; }
  for (const i of data.identities) for (const r of i.revisions) for (const p of r.packages) {
    p.key ??= safeDecode(p.file ?? ''); p.components ??= []; p.advertisedVersions ??= [];
  }
  return data;
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
  const ka = PIONEER_KERNEL_FIRST[a.selection] ?? 3, kb = PIONEER_KERNEL_FIRST[b.selection] ?? 3;
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

/**
 * Parse whatever the user pasted: a retail name, a drive-reported INQUIRY
 * string ("PIONEER BD-RW BDR-UD02D 1.01"), MakeMKV drive info
 * ("Drive platform: Pioneer RS8410 ... Firmware version: ID84"), a MakeMKV SDF
 * name ("HL-DT-ST-BD-RE_BH16NS40-NS50-1.00-N002502-2115..."), hardware + ID
 * ("8510 ID19") or a chipset ("MT1959").
 */
export function parseDriveString(text) {
  const raw = String(text ?? '').trim();
  const out = { raw, vendor: null, model: null, revision: null, hardware: null, bareHardware: [], destination: null, chipset: null, board: null, variantCode: null };
  if (!raw) return out;
  let rest = ' ' + raw.toUpperCase().replace(/[\r\n\t]+/g, ' ') + ' ';
  const take = (re, fn) => { rest = rest.replace(re, (...m) => { fn(m); return ' '; }); };
  // MakeMKV labels are noise; their values are kept.
  rest = rest.replace(/\b(?:DRIVE PLATFORM|FIRMWARE VERSION|FIRMWARE TYPE|FIRMWARE DATE|MANUFACTURER|PRODUCT|REVISION|OS DEVICE NAME|SERIAL NUMBER|HARDWARE)\s*:/g, ' ');
  take(/\b(?:SAT|RS)[\s_-]?([0-9A-F]{4})(?=[\s_-]|$)/, m => { out.hardware = m[1]; });
  take(/(?:^|[\s_-])ID[\s_-]?(\d{2,3})(?=[\s_.-]|$)/, m => { out.destination = 'ID' + m[1]; });
  take(/\bMT[\s-]?(1939|1959|\d{4})\b/, m => { out.chipset = 'MT' + m[1]; });
  // SDF names: VENDOR-TYPE_PRODUCT-BOARD-REV-CODE-STAMP
  const sdf = raw.toUpperCase().match(/_([A-Z0-9]+)-([A-Z0-9]{2,5})-(\d\.\d{2})-([A-Z][A-Z0-9]\d{5})(?:-\d+)?\s*$/);
  if (sdf) {
    out.model = sdf[1]; out.board = sdf[2]; out.revision = sdf[3]; out.variantCode = sdf[4];
    out.vendor = VENDORS.find(v => raw.toUpperCase().startsWith(v)) ?? null;
    return out;
  }
  // Revision: the last "1.01" / "1.01EU" token.
  const revs = [...rest.matchAll(/(?:^|\s)(\d\.\d{2}[A-Z]{0,2})(?=\s|$)/g)];
  if (revs.length) { out.revision = revs.at(-1)[1]; rest = rest.replace(new RegExp('(^|\\s)' + out.revision.replace('.', '\\.') + '(?=\\s|$)'), ' '); }
  const tokens = rest.split(/\s+/).filter(Boolean);
  const kept = [];
  for (const [i, t] of tokens.entries()) {
    const other = tokens.length > 1 || out.hardware || out.destination || out.revision;
    if (!out.vendor && VENDORS.includes(t) && other && kept.length === 0) { out.vendor = t; continue; }
    if (DRIVE_TYPES.has(t)) continue;
    if (/^[0-9][0-9A-F]{3}$/.test(t) && (out.destination || tokens.length === 1)) { out.bareHardware.push(t); continue; }
    if (/^[\/…·|,;:.]+$/.test(t) || t === '...') continue;
    kept.push(t);
  }
  if (kept.length) out.model = kept.join(' ');
  return out;
}

function why(alias) {
  const kind = { retail: 'retail name', oem: 'OEM label', inquiry: 'name the drive reports', firmware: 'name inside the firmware',
    'release-note': 'name in release notes', release: 'published release name', filename: 'download file name', sdf: 'MakeMKV name' }[alias.kind] ?? alias.kind;
  return kind;
}

function identityLabel(i) {
  return `${i.family === 'pioneer' ? 'SAT ' : ''}${i.hardware} · ${i.destination}`;
}

/**
 * Search: exact name -> same drive under other names -> similar names.
 * Each item: {label, kind, targets[], why}. Hardware/ID/chipset in the query
 * narrow the identities a name resolves to.
 */
export function search(index, query) {
  const parsed = parseDriveString(query);
  const groups = { exact: [], otherNames: [], similar: [] };
  if (!parsed.raw) return { parsed, ...groups };
  let hardware = parsed.hardware;
  if (!hardware) hardware = parsed.bareHardware.find(h => index.byHardware.has(h)) ?? null;
  const dest = parsed.destination;
  const constrain = keys => keys.filter(k => {
    const i = index.byKey.get(k);
    if (!i) return false;
    if (hardware && compact(i.hardware) !== hardware && !compact(i.hardware).includes(hardware)) return false;
    if (dest && i.destination !== dest) return false;
    if (parsed.chipset && !i.platforms.some(p => compact(p) === parsed.chipset)) return false;
    if (parsed.board && i.family === 'mediatek' && !compact(i.hardware).endsWith(compact(parsed.board)) && i.hardware.includes(' ')) return false;
    return true;
  });
  const q = compact(parsed.model);
  const seen = new Set();
  const exactKeys = new Set();
  if (q) {
    for (const a of index.aliases) {
      if (a.compact !== q && a.compact !== compact((parsed.vendor ?? '') + parsed.model)) continue;
      const targets = constrain(a.targets);
      const filtered = targets.length < a.targets.length;
      const use = targets.length ? targets : a.targets;
      seen.add(a);
      for (const k of use) exactKeys.add(k);
      groups.exact.push({ label: a.display, kind: a.kind, targets: use, evidence: a.evidence,
        why: `Exact ${why(a)}` + (filtered && targets.length ? ' — narrowed by the hardware/ID you entered' : '') +
          (!targets.length && (hardware || dest) ? ' — but none of its editions match the hardware/ID you entered' : '') });
    }
  }
  if (!groups.exact.length && (hardware || dest || parsed.chipset)) {
    const keys = constrain(index.identities.map(i => i.key));
    if (keys.length && (hardware || parsed.chipset)) {
      for (const k of keys) exactKeys.add(k);
      groups.exact.push({ label: hardware ? `Hardware ${hardware}${dest ? ' · ' + dest : ''}` : parsed.chipset, kind: 'identity', targets: keys,
        why: hardware ? `Matches hardware ${hardware}${dest ? ' and ID ' + dest : ''} exactly` : `Uses the ${parsed.chipset} chipset` });
    }
  }
  for (const k of exactKeys) for (const a of index.namesByKey.get(k) ?? []) {
    if (seen.has(a)) continue;
    seen.add(a);
    const i = index.byKey.get(k);
    groups.otherNames.push({ label: a.display, kind: a.kind, targets: a.targets.filter(t => exactKeys.has(t)), evidence: a.evidence,
      why: `Same drive (${identityLabel(i)}) — ${why(a)}` });
  }
  if (q.length >= 2) {
    const terms = String(parsed.model).toUpperCase().split(/\s+/).map(compact).filter(Boolean);
    for (const a of index.aliases) {
      if (groups.similar.length >= MAX_SIMILAR) break;
      if (seen.has(a)) continue;
      const contains = a.compact.includes(q) || (a.compact.length >= 4 && q.includes(a.compact));
      const allTerms = terms.length > 1 && terms.every(t => a.compact.includes(t) || a.targets.some(k => index.byKey.get(k)?.brands.some(b => compact(b) === t)));
      if (!contains && !allTerms) continue;
      const targets = constrain(a.targets);
      if (!targets.length && (hardware || dest)) continue;
      seen.add(a);
      groups.similar.push({ label: a.display, kind: a.kind, targets: targets.length ? targets : a.targets, evidence: a.evidence,
        why: a.compact.includes(q) ? `Name contains “${parsed.model}”` : contains ? `“${a.display}” is part of what you typed` : 'Name and brand match every word you typed' });
    }
  }
  for (const name of Object.keys(groups)) groups[name] = mergeItems(groups[name]);
  return { parsed: { ...parsed, hardware }, ...groups };
}

function mergeItems(items) {
  const byName = new Map();
  for (const item of items) {
    const c = compact(item.label);
    const prev = byName.get(c);
    if (!prev) { byName.set(c, { ...item, targets: [...item.targets] }); continue; }
    for (const t of item.targets) pushUnique(prev.targets, t);
    if (!prev.why.includes(item.why)) prev.why += '; ' + item.why.replace(/^Exact |^Same drive \([^)]*\) — /, '');
  }
  return [...byName.values()];
}

/** Plain-English picker rows for a name that maps to several identities. */
export function pickerOptions(index, keys) {
  return keys.map(k => index.byKey.get(k)).filter(Boolean).map(i => {
    const names = index.namesByKey.get(i.key) ?? [];
    const soldAs = [...new Set(names.filter(a => SOLD_AS.has(a.kind)).map(a => a.display))];
    const newest = i.revisions[0]?.revision ?? null;
    return { key: i.key, family: i.family, hardware: i.hardware, destination: i.destination, brands: i.brands,
      soldAs: soldAs.length ? soldAs : [...new Set(names.map(a => a.display))].slice(0, 4), newest,
      revisionCount: i.revisions.length };
  }).sort((a, b) => a.hardware.localeCompare(b.hardware) || a.destination.localeCompare(b.destination));
}

/** Resolve ?hw=&id=&rev= (and ?q=) into an identity or picker. */
export function parseUrlParams(search) {
  const p = new URLSearchParams(search);
  const hw = p.get('hw'), id = p.get('id');
  return { hardware: hw ? compact(normalizeHardware(hw)) : null, destination: id ? normalizeDestination(id) : null,
    revision: p.get('rev')?.trim() || null, query: p.get('q')?.trim() || null,
    mode: p.get('mode') === 'crossflash' ? 'crossflash' : 'firmware' };
}

export function resolveIdentity(index, { hardware, destination }) {
  if (!hardware && !destination) return [];
  return index.identities.filter(i => (!hardware || compact(i.hardware) === hardware) && (!destination || i.destination === destination)).map(i => i.key);
}

/** Cross-flash candidates for the firmware view (same hardware only). */
export function crossflashGroups(index, key) {
  return crossflashFrom(index, key);
}

function regionsOf(identity) {
  const set = new Set();
  for (const r of identity.revisions) for (const p of r.packages) for (const a of p.advertisedVersions ?? []) {
    const m = String(a).match(/\d\.\d{2}([A-Z]{2})$/);
    if (m) set.add(m[1]);
  }
  return [...set].sort();
}

/**
 * What visibly changes when a drive becomes `to`, using catalogue data only:
 * the ID label, the name the drive reports, and published regions/features.
 */
export function editionChanges(from, to) {
  const changes = [{ term: 'id', text: `The drive's ID changes from ${from.destination} to ${to.destination}` }];
  const a = from.embeddedModels.join(', '), b = to.embeddedModels.join(', ');
  if (b && a !== b) changes.push({ term: 'name', text: `The drive will report itself as ${b}${a ? ` instead of ${a}` : ''}` });
  const ra = regionsOf(from).join(', '), rb = regionsOf(to).join(', ');
  if (rb && ra !== rb) changes.push({ term: 'region', text: `Its firmware is published for ${rb}${ra ? ` (yours: ${ra})` : ''}` });
  const feat = i => i.revisions[0]?.packages[0]?.features?.filter(f => f.ok).map(f => f.name).join(', ') ?? '';
  const fa = feat(from), fb = feat(to);
  if (fb && fa !== fb) changes.push({ term: 'features', text: `Firmware features: ${fb}` });
  return changes;
}

function decorate(index, from, other, candidate) {
  return {
    key: other.key, status: candidate.status, steps: candidate.steps ?? [], evidence: candidate.evidence ?? [],
    caution: candidate.caution ?? null, kernelDiff: candidate.kernelDiff ?? null, identity: other,
    names: soldNames(index, other.key),
    latest: other.revisions[0]?.revision ?? null, changes: editionChanges(from, other),
  };
}

function soldNames(index, key) {
  return [...new Set((index.namesByKey.get(key) ?? []).filter(isSoldAs).map(a => a.display))];
}

function statusGroup(status) {
  return status === 'proven' ? 'proven' : (status === 'likely' || status === 'reported') ? 'likely' : 'untested';
}

/** "What can my drive become?": other editions on the same hardware. */
export function crossflashFrom(index, key) {
  const i = index.byKey.get(key);
  const groups = { proven: [], likely: [], untested: [] };
  if (!i) return groups;
  for (const c of i.candidates) {
    const other = index.byKey.get(c.key);
    if (!other || other.key === i.key || other.family !== i.family || compact(other.hardware) !== compact(i.hardware)) continue;
    const status = statusGroup(c.status);
    groups[status].push(decorate(index, i, other, { ...c, status }));
  }
  return groups;
}

/** Reverse lookup: "which drives can become this edition?". */
export function crossflashTo(index, key) {
  const target = index.byKey.get(key);
  const groups = { proven: [], likely: [], untested: [] };
  if (!target) return groups;
  for (const source of index.byHardware.get(compact(target.hardware)) ?? []) {
    if (source.key === target.key || source.family !== target.family) continue;
    const c = source.candidates.find(x => x.key === target.key);
    if (!c) continue;
    const status = statusGroup(c.status);
    groups[status].push(decorate(index, source, target, { ...c, status, key: source.key, identity: source }));
    const row = groups[status].at(-1);
    row.key = source.key; row.identity = source; row.latest = source.revisions[0]?.revision ?? null;
    row.names = soldNames(index, source.key);
  }
  return groups;
}

function editDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** "Did you mean": closest names by edit distance (bounded, cheap). */
export function suggestions(index, query, max = 5) {
  const q = compact(parseDriveString(query).model ?? query);
  if (q.length < 3) return [];
  const limit = Math.max(1, Math.min(3, Math.floor(q.length / 3)));
  const scored = [];
  const seen = new Set();
  for (const a of index.aliases) {
    if (seen.has(a.compact)) continue;
    const d = editDistance(q, a.compact, limit);
    if (d <= limit) { seen.add(a.compact); scored.push([d, a]); }
  }
  return scored.sort((x, y) => x[0] - y[0] || x[1].display.localeCompare(y[1].display)).slice(0, max).map(([, a]) => a.display);
}

export function componentsLabel(components) {
  if (!components?.length || !components.every(r => r === 'kernel' || r === 'main')) return null;
  return [components.includes('kernel') && 'Kernel', components.includes('main') && 'Normal'].filter(Boolean).join(' + ');
}

/** One-line provenance for a package; the catalogue's own line wins. */
export function provenanceLine(identity, revision, pkg) {
  if (pkg.provenance) return pkg.provenance;
  const who = titleBrand(pkg.brand) || identity.brands[0] || '';
  const parts = [`${who ? who + ' ' : ''}${pkg.embeddedModel || identity.hardware} firmware ${revision}`.trim()];
  if (pkg.advertisedVersions?.length) parts.push(`published as ${pkg.advertisedVersions.join(', ')}`);
  if (pkg.generatedDate) parts.push(`built ${pkg.generatedDate}`);
  if (pkg.buildId) parts.push(`build ${pkg.buildId}`);
  return parts.join('; ') + (pkg.packageType === 'pioneer-installer' ? ' — repackaged unchanged from the official updater' : '');
}

/**
 * Everything the result view needs for one identity. `known` is what the user
 * told us about their drive (hardware, destination, revision).
 */
export function identityView(index, key, known = {}) {
  const i = index.byKey.get(key);
  if (!i) return null;
  const newest = i.revisions[0] ?? null;
  const recommended = newest ? { revision: newest.revision, package: newest.packages[0] } : null;
  const checklist = [];
  const hwLabel = i.family === 'pioneer' ? `SAT ${i.hardware}` : i.hardware;
  if (known.hardware) checklist.push({ term: 'hardware', ok: compact(i.hardware) === compact(known.hardware) || compact(i.hardware).includes(compact(known.hardware)),
    text: `Your drive's hardware ${known.hardware} ${compact(i.hardware).includes(compact(known.hardware)) ? 'matches' : 'does not match'} ${hwLabel}` });
  else checklist.push({ term: 'hardware', ok: null, text: `Check your drive reports hardware ${hwLabel}` });
  if (known.destination) checklist.push({ term: 'id', ok: known.destination === i.destination,
    text: `Your drive's ID ${known.destination} ${known.destination === i.destination ? 'matches' : 'does not match'} ${i.destination}` });
  else checklist.push({ term: 'id', ok: null, text: `Check your drive reports the ID ${i.destination}` });
  if (newest) {
    if (known.revision) {
      const cmp = compareRevision(newest.revision, known.revision);
      checklist.push({ term: 'revision', ok: cmp >= 0,
        text: cmp > 0 ? `Newest available is ${newest.revision}; your drive has ${known.revision} — this is an update`
          : cmp === 0 ? `Your drive already has ${known.revision}, the newest we have` : `Your drive has ${known.revision}, newer than anything we have (${newest.revision})` });
    } else checklist.push({ term: 'revision', ok: null, text: `Newest available revision is ${newest.revision}` });
  }
  const timeline = [
    ...i.revisions.map(r => ({ revision: r.revision, status: 'available', packages: r.packages })),
    ...i.missing.map(revision => ({ revision, status: 'missing', packages: [] })),
  ].sort((a, b) => compareRevision(b.revision, a.revision));
  for (const t of timeline) {
    t.isRecommended = recommended && t.revision === recommended.revision;
    t.isCurrent = Boolean(known.revision) && compareRevision(t.revision, known.revision) === 0;
  }
  return {
    identity: i, hardwareLabel: hwLabel, checklist, recommended, timeline,
    provenance: recommended?.package ? provenanceLine(i, recommended.revision, recommended.package) : null,
    names: index.namesByKey.get(i.key) ?? [], crossflash: crossflashGroups(index, key),
  };
}

/** Browse fallback: brand -> chipset family -> hardware, with counts. */
export function browseTree(index) {
  const brands = new Map();
  for (const i of index.identities) {
    const brand = i.brands[0] || (i.family === 'mediatek' ? titleBrand(i.hardware.split(' ')[0]) : titleBrand(i.family));
    const family = i.family === 'pioneer' ? 'Pioneer' : (i.platforms.find(p => /^MT/.test(p)) ?? titleBrand(i.family));
    if (!brands.has(brand)) brands.set(brand, new Map());
    const fam = brands.get(brand);
    if (!fam.has(family)) fam.set(family, new Map());
    const hw = fam.get(family);
    if (!hw.has(i.hardware)) hw.set(i.hardware, []);
    hw.get(i.hardware).push(i.key);
  }
  const count = keys => keys.reduce((n, k) => n + (index.byKey.get(k)?.revisions.length ?? 0), 0);
  return [...brands].map(([brand, fams]) => {
    const families = [...fams].map(([family, hws]) => {
      const hardware = [...hws].map(([h, keys]) => ({ hardware: h, keys, editions: keys.length, revisions: count(keys) }))
        .sort((a, b) => a.hardware.localeCompare(b.hardware));
      return { family, hardware, revisions: hardware.reduce((n, h) => n + h.revisions, 0) };
    }).sort((a, b) => a.family.localeCompare(b.family));
    return { brand, families, revisions: families.reduce((n, f) => n + f.revisions, 0) };
  }).sort((a, b) => b.revisions - a.revisions || a.brand.localeCompare(b.brand));
}

/** Hero counts: hosted packages by chipset. */
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

/**
 * What the page shows for a URL: ?mode=crossflash, ?hw=&id=&rev= deep links
 * (one identity or a picker), or ?q= to prefill the search.
 */
export function routeFromUrl(index, searchString) {
  const p = parseUrlParams(searchString);
  const known = { hardware: p.hardware, destination: p.destination, revision: p.revision };
  const keys = resolveIdentity(index, p);
  if (keys.length === 1) return { mode: p.mode, view: 'identity', keys, known, query: p.query };
  if (keys.length > 1) return { mode: p.mode, view: 'picker', keys, known, query: p.query };
  if (p.query) return { mode: p.mode, view: 'search', keys: [], known, query: p.query };
  return { mode: p.mode, view: 'none', keys: [], known, query: null };
}

export function urlFor({ mode, identity, revision }) {
  const p = new URLSearchParams();
  if (mode === 'crossflash') p.set('mode', 'crossflash');
  if (identity) { p.set('hw', identity.hardware); p.set('id', identity.destination); }
  if (revision) p.set('rev', revision);
  const s = p.toString();
  return s ? '?' + s : '';
}
