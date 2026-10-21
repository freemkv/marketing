import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { flashChangelog, generate } from './flash-changelog.mjs';

const source = `# Changelog
## [0.14.0] - Unreleased
- Future changes.
## [0.13.4] - 2026-10-20
### freemkv Modify
- Choose firmware startup settings.
### freemkv Flash
- Preview Recovery before confirming.
## [0.13.3] - 2026-10-19
- Fix a flash preflight refusal.
`;
const release = { version: '0.13.4', tag: 'v0.13.4', date: 'October 20, 2026' };

test('publishes reviewed product impact for Flash and Modify, excluding future work', () => {
  const out = flashChangelog(source, release);
  assert.match(out, /^## 0\.13\.4\n\n<small>2026-10-20<\/small>/m);
  assert.match(out, /Choose firmware startup settings/);
  assert.match(out, /Preview Recovery before confirming/);
  assert.match(out, /^## 0\.13\.3/m);
  assert.doesNotMatch(out, /0\.14\.0|Future changes|Unreleased/);
});

test('a published tag can retain its Unreleased heading without exposing development', () => {
  const out = flashChangelog(source.replace('2026-10-20', 'Unreleased'), release);
  assert.match(out, /^## 0\.13\.4\n\n<small>October 20, 2026<\/small>/m);
  assert.doesNotMatch(out, /0\.14\.0|Unreleased/);
});

test('new releases need reviewed notes and internal sections fail publication', () => {
  assert.throws(() => flashChangelog(source, { version: '0.15.0' }), /add reviewed customer notes/);
  for (const heading of ['Development', 'Build', 'CI', 'Testing', 'Validation', 'Internal']) {
    assert.throws(() => flashChangelog(source.replace('### freemkv Flash', `### ${heading}`), release), /internal section/);
  }
});

test('generator takes only release metadata from GitHub and reads local reviewed prose', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'flash-notes-'));
  try {
    const sourcePath = join(dir, 'reviewed.md'), outPath = join(dir, 'page.md');
    writeFileSync(sourcePath, source);
    await generate({ sourcePath, outPath, getRelease: async repo => {
      assert.equal(repo, 'freemkv-firmware');
      return { ...release, body: '### Development\n- Internal build details.' };
    } });
    const out = readFileSync(outPath, 'utf8');
    assert.match(out, /Choose firmware startup settings/);
    assert.doesNotMatch(out, /Development|Internal build/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('all customer histories omit development and release-process sections', () => {
  for (const file of ['../src/content/docs/docs/changelog.md', '../src/data/flash-changelog.md']) {
    const notes = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(notes, /^#{2,}\s+(?:Development|Build|CI|Testing|Quality and maintenance)\b/im);
    assert.doesNotMatch(notes, /OpenSSF Scorecard|provenance-ready CI|Release checks now verify|disc-emulator test tool|This release aligns all components/);
  }
  const notes = readFileSync(new URL('../src/data/flash-changelog.md', import.meta.url), 'utf8');
  assert.match(notes, /^## \[0\.13\.4\]/m);
  assert.doesNotMatch(flashChangelog(notes, release), /0\.14\.0/);
});
