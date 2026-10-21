import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { initializeTheme } from '../src/lib/theme.mjs';

function browser({ stored, dark = false, blocked = false } = {}) {
  const data = new Map(stored === undefined ? [] : [['starlight-theme', stored]]);
  const documentEvents = new Map(), windowEvents = new Map(), mediaEvents = new Map();
  const selects = [{ value: 'system' }, { value: 'system' }];
  const media = { matches: dark, addEventListener: (name, callback) => mediaEvents.set(name, callback) };
  const document = {
    documentElement: { dataset: {}, style: {} },
    querySelectorAll: () => selects,
    addEventListener: (name, callback) => documentEvents.set(name, callback),
  };
  const win = { document, matchMedia: () => media,
    addEventListener: (name, callback) => windowEvents.set(name, callback),
    get localStorage() {
      if (blocked) throw new Error('Storage is blocked');
      return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    },
  };
  return { win, document, selects, data, media, documentEvents, windowEvents, mediaEvents };
}

for (const dark of [false, true]) test(`first visit follows the system (${dark ? 'dark' : 'light'})`, () => {
  const b = browser({ dark }); initializeTheme(b.win);
  assert.equal(b.win.freemkvTheme.preference, 'system');
  assert.equal(b.document.documentElement.dataset.theme, dark ? 'dark' : 'light');
  assert.equal(b.document.documentElement.style.colorScheme, dark ? 'dark' : 'light');
  assert.deepEqual(b.selects.map(s => s.value), ['system', 'system']);
  assert.equal(b.data.size, 0, 'visiting must not save an artificial explicit preference');
});

test('explicit choices persist across page loads and ignore system changes', () => {
  const b = browser(); initializeTheme(b.win); b.win.freemkvTheme.set('dark');
  assert.equal(b.data.get('starlight-theme'), 'dark');
  b.media.matches = false; b.mediaEvents.get('change')();
  assert.equal(b.document.documentElement.dataset.theme, 'dark');
  const next = browser({ stored: b.data.get('starlight-theme') }); initializeTheme(next.win);
  assert.equal(next.document.documentElement.dataset.theme, 'dark');
  next.win.freemkvTheme.set('light');
  assert.equal(next.document.documentElement.dataset.theme, 'light');
  assert.equal(next.data.get('starlight-theme'), 'light');
});

test('returning to System follows OS changes and synchronizes all selectors', () => {
  const b = browser({ stored: 'light', dark: true }); initializeTheme(b.win);
  b.documentEvents.get('change')({ target: { matches: () => true, value: 'system' } });
  assert.equal(b.data.get('starlight-theme'), '');
  assert.equal(b.document.documentElement.dataset.theme, 'dark');
  b.media.matches = false; b.mediaEvents.get('change')();
  assert.equal(b.document.documentElement.dataset.theme, 'light');
  assert.deepEqual(b.selects.map(s => s.value), ['system', 'system']);
});

test('blocked storage does not break initialization or changing the theme', () => {
  const b = browser({ blocked: true, dark: true });
  assert.doesNotThrow(() => initializeTheme(b.win));
  assert.equal(b.document.documentElement.dataset.theme, 'dark');
  assert.doesNotThrow(() => b.win.freemkvTheme.set('light'));
  assert.equal(b.document.documentElement.dataset.theme, 'light');
});

test('invalid and legacy automatic preferences use System', () => {
  for (const stored of ['', 'auto', 'system', 'broken']) {
    const b = browser({ stored, dark: true }); initializeTheme(b.win);
    assert.equal(b.win.freemkvTheme.preference, 'system');
    assert.equal(b.document.documentElement.dataset.theme, 'dark');
  }
});

test('cross-tab changes and cleared storage update the current page', () => {
  const b = browser({ stored: 'light', dark: true }); initializeTheme(b.win);
  b.data.set('starlight-theme', 'dark'); b.windowEvents.get('storage')({ key: 'starlight-theme' });
  assert.equal(b.document.documentElement.dataset.theme, 'dark');
  b.data.clear(); b.windowEvents.get('storage')({ key: null });
  assert.equal(b.win.freemkvTheme.preference, 'system');
  b.media.matches = false; b.mediaEvents.get('change')();
  assert.equal(b.document.documentElement.dataset.theme, 'light');
});

test('the head script is self-contained and idempotent before markup exists', () => {
  const b = browser({ stored: 'dark' }); b.selects.length = 0;
  runInNewContext(`(${initializeTheme.toString()})(window)`, { window: b.win });
  const controller = b.win.freemkvTheme;
  b.selects.push({ value: 'system' }); b.documentEvents.get('DOMContentLoaded')();
  assert.equal(b.selects[0].value, 'dark');
  initializeTheme(b.win); assert.equal(b.win.freemkvTheme, controller);
});

test('marketing and docs share a header selector and preference provider', () => {
  for (const path of ['index', 'download', 'firmware/index', 'firmware/find', 'firmware/flash', 'firmware/modify']) {
    const page = readFileSync(new URL(`../src/pages/${path}.astro`, import.meta.url), 'utf8');
    assert.match(page, /<head>[\s\S]*?<ThemeHead\s*\/>[\s\S]*?<\/head>/);
    assert.match(page, /<header[\s\S]*?<ThemeSelect\s*\/>[\s\S]*?<\/header>/);
  }
  const config = readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
  assert.match(config, /ThemeProvider: '\.\/src\/components\/ThemeHead.astro'/);
  assert.match(config, /ThemeSelect: '\.\/src\/components\/ThemeSelect.astro'/);
  assert.doesNotMatch(config, /localStorage\.setItem\('starlight-theme','light'\)/);
});

test('Flash and Pioneer support pages drop Beta copy and retain the old anchor', () => {
  const flash = readFileSync(new URL('../src/pages/firmware/flash.astro', import.meta.url), 'utf8');
  const docs = readFileSync(new URL('../src/content/docs/docs/drives-unlocked.md', import.meta.url), 'utf8');
  assert.doesNotMatch(flash, /\bBeta\b/);
  assert.doesNotMatch(docs.replace(/<[^>]+>/g, ''), /Pioneer[^\n]*\bbeta\b/i);
  assert.doesNotMatch(docs, /Pioneer beta support is now available in freemkv 1\.8\.3/);
  assert.match(docs, /id="pioneer-drives-beta"/);
  assert.match(docs, /^### Pioneer drives$/m);
});
