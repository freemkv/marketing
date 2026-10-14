import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  metadataExclusion, hasAppliedLever, lineageOf, featuresFor, modelOf, brandOf, buildEntry, buildIndex,
  buildFeaturesDoc, buildSummary, sortEntries, loadCandidates, evaluate, generate,
  isDriveRead, deMaskedSha, DE_OFFSET, hasVendorProvenance, dedupeByDeMask, loadExclusions, EXCLUSIONS,
} from './firmware-features.mjs';

const sha = c => c.repeat(64);
const lever = (id, outcome) => ({ id, label: id, outcome, facts: {} });
const create = (over = {}) => ({
  engine: 'MT1939', vendor: 'HL-DT-ST', model: 'BD-RE  BH16NS40', rev: '1.02', vendor_specific: 'N000201', media: 'BD',
  levers: [lever('Identity', 'Applied'), lever('Speed', 'Applied'), lever('RawRead', { SignatureNotFound: { detail: 'x' } })], ...over,
});
const base = { base_facts: { handler_va: 1, boot_stub_va: 2, boot_init_site: 3, de_off: 4, speed_gate: 5, region_emitter: 6, ake_gate: 7, uhd_stub_va: 8, bd_stub_va: 9, hrl_sites: 1 } };

test('eligibility: patched, omnidrive, fragment and listed exclusions are excluded; unMK counts as OEM', () => {
  const img = (mediatek = {}) => ({ sha256: sha('a'), mediatek });
  assert.equal(metadataExclusion(img({ patched: true })), 'patched');
  assert.equal(metadataExclusion(img({ patched: false, fragment: true })), 'fragment');
  assert.equal(metadataExclusion(img({ patched: false }), ['Foo_OmniDrive_v2.exe']), 'omnidrive');
  assert.equal(metadataExclusion(img({ patched: false }), ['omnidrive.bin']), 'omnidrive');
  assert.equal(metadataExclusion(img({ patched: false, fragment: false }), ['unMK_BU40N_BU12.bin']), null);
  assert.equal(metadataExclusion(img({}), []), null);
  assert.equal(metadataExclusion(img({}), [], new Set([sha('a')])), 'excluded');
});

test('eligibility: a raw drive read is detected by its boot page mirror', () => {
  const image = Buffer.alloc(0x20000, 0xff);
  image.fill(0x11, 0, 0x400); image.fill(0x22, 0x10000, 0x10400);
  assert.equal(isDriveRead(image), false);
  image.fill(0x22, 0, 0x400);
  assert.equal(isDriveRead(image), true);
  assert.equal(isDriveRead(Buffer.alloc(0x100)), false);
});

test('dedup: images differing only in the DE byte collapse to the vendor one', () => {
  const a = Buffer.alloc(DE_OFFSET + 16, 0x5a), b = Buffer.from(a), c = Buffer.from(a);
  a[DE_OFFSET] = 0xff; b[DE_OFFSET] = 0xde; c[DE_OFFSET - 1] = 0;
  assert.equal(deMaskedSha(a), deMaskedSha(b));
  assert.notEqual(deMaskedSha(a), deMaskedSha(c));
  const items = [
    { sha: sha('1'), masked: deMaskedSha(b), vendor: false },
    { sha: sha('2'), masked: deMaskedSha(a), vendor: true },
    { sha: sha('3'), masked: deMaskedSha(c), vendor: false },
  ];
  const { kept, dropped } = dedupeByDeMask(items);
  assert.deepEqual(kept.map(x => x.sha), [sha('2'), sha('3')]);
  assert.deepEqual(dropped.map(x => x.sha), [sha('1')]);
  // Vendor provenance wins even over a lower sha.
  assert.deepEqual(dedupeByDeMask([items[1], { ...items[0], sha: sha('0') }]).kept.map(x => x.sha), [sha('2')]);
});

test('provenance: vendor updater members count, DE packs, dumps and unMK do not', () => {
  assert.equal(hasVendorProvenance(['BH16NS40_1.01-A1ew.zip::BH16NS40_1.01-A1.exe::rsrc48::decoded']), true);
  assert.equal(hasVendorProvenance(['DE-firmware-pack.zip::DE-firmware-pack/Desktop drives/DE_ASUS_BC-12D2HT_3.00.bin']), false);
  assert.equal(hasVendorProvenance(['Downgrade Enabled Firmware V.2.zip::DE_ASUS_BW-16D1HT_302.BIN']), false);
  assert.equal(hasVendorProvenance(['dump_full_WH16NS60_1.00.zip::x.bin']), false);
  assert.equal(hasVendorProvenance(['unMK_WH16NS58_1.V5_N004900_873a8c96.bin', 'WH16NS58_1.V5_873a8c96.bin']), false);
});

test('exclusions file: every row is sha-bound with a reason', async t => {
  assert.ok((await loadExclusions(EXCLUSIONS)).size > 0);
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'fwexcl-')); t.after(() => fs.rm(d, { recursive: true, force: true }));
  const bad = path.join(d, 'x.json');
  await fs.writeFile(bad, JSON.stringify([{ sha256: sha('a') }]));
  await assert.rejects(loadExclusions(bad), /reason/);
  await fs.writeFile(bad, '{}');
  await assert.rejects(loadExclusions(bad), /not a JSON array/);
});

test('eligibility: zero applied levers means not listed', async () => {
  assert.equal(hasAppliedLever(create()), true);
  const none = create({ levers: [lever('Identity', 'AlreadyPresent'), lever('Speed', { SignatureNotFound: {} })] });
  assert.equal(hasAppliedLever(none), false);
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'fweval-')), 'x.bin');
  await fs.writeFile(file, 'x');
  const run = async args => ({ code: 0, out: JSON.stringify(args.includes('--base') ? base : none) });
  assert.deepEqual(await evaluate({ sha: sha('b'), file }, run, os.tmpdir()), { reason: 'no-applied-lever' });
  const createFails = async args => ({ code: args[0] === 'verify' ? 0 : 1, out: '' });
  assert.deepEqual(await evaluate({ sha: sha('b'), file }, createFails, os.tmpdir()), { reason: 'no-applied-lever' });
  const verifyFails = async args => ({ code: args[0] === 'verify' ? 1 : 0, out: JSON.stringify(args.includes('--base') ? base : create()) });
  assert.deepEqual(await evaluate({ sha: sha('b'), file }, verifyFails, os.tmpdir()), { reason: 'integrity' });
});

test('lever/engine -> lineage -> 7 flags', () => {
  const k = f => f.map(x => `${x.key}:${x.ok ? 1 : 0}`).join(',');
  assert.equal(lineageOf('MT1959', []), 'MT1959-lineage');
  assert.equal(lineageOf('MT1939', [lever('Speed', 'Applied')]), 'MT1959-lineage');
  assert.equal(lineageOf('MT1939', [lever('Speed', 'AlreadyPresent')]), 'MT1959-lineage');
  assert.equal(lineageOf('MT1939', [lever('Speed', { SignatureNotFound: {} })]), 'MT1939-classic');
  assert.equal(lineageOf('MT1939', []), 'MT1939-classic');
  assert.equal(k(featuresFor('MT1959-lineage')), 'Speed:1,Region:1,UHD:1,BD:1,HRL:1,AKE:1,Bus:1');
  assert.equal(k(featuresFor('MT1939-classic')), 'Speed:0,Region:1,UHD:0,BD:0,HRL:1,AKE:1,Bus:1');
  assert.deepEqual(featuresFor('MT1959-lineage').map(f => f.name), ['Speed', 'Region-free', 'UHD', 'BD', 'HRL Bypass', 'AKE Bypass', 'Bus Decrypt']);
});

test('model, brand and entry shape', () => {
  assert.equal(modelOf('BD-RE  BU40N'), 'BU40N');
  assert.equal(modelOf('BC-12B1ST   b'), 'BC-12B1ST');
  assert.equal(modelOf('BW-16D1H-U'), 'BW-16D1H');
  assert.equal(modelOf('BC-12D2HT'), 'BC-12D2HT');
  assert.equal(brandOf(sha('a'), 'ASUS'), 'ASUS');
  assert.equal(brandOf(sha('a'), 'hp'), 'HP');
  assert.equal(brandOf(sha('a'), 'HL-DT-ST'), 'LG');
  assert.equal(brandOf('c328b656' + '0'.repeat(56), 'HL-DT-ST'), 'dynabook');
  const e = buildEntry({ sha: sha('c'), bytes: 10, create: create(), base });
  assert.deepEqual(Object.keys(e), ['sha256', 'bytes', 'src', 'engine', 'chip', 'brand', 'vendor', 'model', 'rev', 'media', 'variant', 'base_ok', 'base_only', 'confidence', 'advertised', 'features', 'base_facts', 'r2_key', 'lineage']);
  assert.equal(e.r2_key, 'MT1939/BH16NS40_1.02_cccccccc.bin');
  assert.equal(e.src, `/tmp/corpus_dw/MT1939_BH16NS40_${'c'.repeat(16)}.bin`);
  assert.equal(e.confidence, 'build-verified');
  assert.equal(buildEntry({ sha: sha('c'), bytes: 10, create: create(), base, hardwareVerified: true }).confidence, 'hardware-verified');
});

test('documents: counts, per_flag, index grouping and summary', () => {
  const a = buildEntry({ sha: sha('a'), bytes: 1, create: create(), base });
  const b = buildEntry({ sha: sha('b'), bytes: 1, create: create({ model: 'BD-RE  BH14NS40', rev: '1.00', levers: [lever('Identity', 'Applied'), lever('Speed', { SignatureNotFound: {} })] }), base });
  const doc = buildFeaturesDoc(sortEntries([a, b]));
  assert.equal(doc.counts.total, 2);
  assert.equal(doc.counts.build_verified, 2);
  assert.equal(doc.counts.hardware_verified, 0);
  assert.deepEqual(doc.per_flag, { Speed: 1, 'Region-free': 2, UHD: 1, BD: 1, 'HRL Bypass': 2, 'AKE Bypass': 2, 'Bus Decrypt': 2 });
  assert.match(doc.note, /2-entry/);
  assert.match(doc.note, /\(1 images\); MT1939-classic.*, 1 images\)/);
  assert.deepEqual(doc.images.map(i => i.model), ['BH14NS40', 'BH16NS40']);
  const idx = buildIndex(doc.images);
  assert.deepEqual(idx.map(g => g.model), ['BH14NS40', 'BH16NS40']);
  assert.equal(idx[0].versions[0].file, 'MT1939/BH14NS40_1.00_bbbbbbbb.bin');
  assert.equal(idx[0].versions[0].modifiable, true);
  const md = buildSummary(doc);
  assert.match(md, /scripts\/firmware-features\.mjs/);
  assert.match(md, /\| MT1939 \| LG \| BH14NS40 \| 1\.00 \| features \| build \| - \| yes \| - \| - \| yes \| yes \| yes \|/);
});

test('end to end over a fixture hoard with a fake engine; no binaries needed', async t => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'fwfeat-')); t.after(() => fs.rm(d, { recursive: true, force: true }));
  await fs.mkdir(path.join(d, 'index')); await fs.mkdir(path.join(d, 'images'));
  const shas = { oem: sha('1'), patched: sha('2'), omni: sha('3'), frag: sha('4'), zero: sha('5') };
  const images = Object.entries(shas).map(([k, s]) => ({ sha256: s, path: `images/${k}.bin`, mediatek: { patched: k === 'patched', fragment: k === 'frag' } }));
  for (const [k] of Object.entries(shas)) await fs.writeFile(path.join(d, 'images', `${k}.bin`), k);
  await fs.writeFile(path.join(d, 'index/identities.json'), JSON.stringify({ identities: [{ family: 'mediatek', images }, { family: 'pioneer', images: [{ sha256: sha('9'), path: 'x', mediatek: {} }] }] }));
  await fs.writeFile(path.join(d, 'index/sources.json'), JSON.stringify({ sources: [
    { extraction: { image: shas.omni }, names: ['OmniDrive_fw.bin'] },
    { extraction: { image: shas.oem }, names: ['BH16NS40_1.02.bin'] },
    { extraction: { image: null }, names: ['ignored'] },
  ] }));
  const { candidates, excluded } = await loadCandidates(d);
  assert.deepEqual(candidates.map(c => c.sha).sort(), [shas.oem, shas.zero].sort());
  assert.deepEqual(excluded, { patched: 1, omnidrive: 1, fragment: 1 });
  const fw = path.join(d, 'fake-fw.sh');
  await fs.writeFile(fw, `#!/bin/sh
case "$*" in *${shas.zero}*|*zero.bin*) L='[{"id":"Speed","label":"Speed","outcome":"AlreadyPresent","facts":{}}]';; *) L='[{"id":"Speed","label":"Speed","outcome":"Applied","facts":{}}]';; esac
if [ "$2" = "--base" ]; then echo '${JSON.stringify(base)}'; else echo '{"engine":"MT1939","vendor":"HL-DT-ST","model":"BD-RE  BH16NS40","rev":"1.02","vendor_specific":"N000201","media":"BD","levers":'"$L"'}'; fi
`, { mode: 0o755 });
  const out = path.join(d, 'out');
  const res = await generate({ hoard: d, fw, outDir: out, jobs: 2, exclusions: new Set() });
  assert.deepEqual(res.entries.map(e => e.sha256), [shas.oem]);
  assert.equal(res.excluded['no-applied-lever'], 1);
  const doc = JSON.parse(await fs.readFile(path.join(out, 'firmware-features.json'), 'utf8'));
  assert.equal(doc.counts.total, 1);
  assert.equal(doc.images[0].confidence, 'build-verified');
  const hw = await generate({ hoard: d, fw, outDir: out, hardware: new Set([shas.oem]), jobs: 1, exclusions: new Set() });
  assert.equal(hw.entries[0].confidence, 'hardware-verified');
  assert.equal(JSON.parse(await fs.readFile(path.join(out, 'firmware-features.json'), 'utf8')).counts.hardware_verified, 1);
});
