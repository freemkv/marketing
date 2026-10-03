import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function* files(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p); else if (/\.(html|js|mjs|json|txt|xml|css)$/.test(e.name)) yield p;
  }
}

// With Turnstile enabled the site must not expose the public bucket origin anywhere.
test('protected build ships no public R2 bucket URL', { timeout: 300000 }, async t => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'freemkv-protected-'));
  t.after(() => fs.rm(out, { recursive: true, force: true }));
  const r = spawnSync(path.join(SITE, 'node_modules/.bin/astro'), ['build', '--outDir', out], { cwd: SITE, encoding: 'utf8',
    env: { ...process.env, PUBLIC_FIRMWARE_TURNSTILE_SITEKEY: '1x00000000000000000000AA' } });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const finder = await fs.readFile(path.join(out, 'firmware/find/index.html'), 'utf8');
  assert.match(finder, /data-protected="1"/);
  assert.doesNotMatch(finder, /data-base-url/);
  const leaks = [];
  for await (const f of files(out)) if ((await fs.readFile(f, 'utf8')).includes('r2.dev')) leaks.push(path.relative(out, f));
  assert.deepEqual(leaks, []);
});
