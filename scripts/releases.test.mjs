import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRelease, pendingRelease } from '../src/lib/releases.mjs';
const release = { tag_name: 'v0.10.2', published_at: '2026-10-05T00:00:00Z', draft: false, prerelease: false };
test('release metadata supplies initial version and UTC date', async () => {
  const result = await fetchRelease('freemkv-firmware', async url => {
    assert.equal(url, 'https://api.github.com/repos/freemkv/freemkv-firmware/releases/latest');
    return { ok: true, json: async () => release };
  });
  assert.deepEqual(result, { tag: 'v0.10.2', version: '0.10.2', date: 'October 5, 2026' });
});
test('API failure and invalid releases fail the build instead of inventing a fallback', async () => {
  await assert.rejects(fetchRelease('freemkv', async () => ({ ok: false, status: 403 })), /HTTP 403/);
  for (const change of [{draft:true}, {prerelease:true}, {tag_name:'bad'}, {published_at:'bad'}]) {
    await assert.rejects(fetchRelease('freemkv', async () => ({ok:true,json:async()=>({...release,...change})})), /Invalid stable/);
  }
});
test('a pending freemkv-firmware release stands in for latest during its own deploy', () => {
  const sha = 'a'.repeat(64);
  const provenance = JSON.stringify({ tag: 'v0.18.1', assets: { 'freemkv-fw-cli-x86_64-linux': sha } });
  const now = new Date('2026-11-13T00:00:00Z');
  assert.equal(pendingRelease('freemkv', provenance, now), null);
  assert.equal(pendingRelease('freemkv-firmware', '', now), null);
  assert.deepEqual(pendingRelease('freemkv-firmware', provenance, now), {
    tag_name: 'v0.18.1', draft: false, prerelease: false, published_at: '2026-11-13T00:00:00.000Z',
    assets: [{ name: 'freemkv-fw-cli-x86_64-linux', digest: `sha256:${sha}` }],
  });
  for (const bad of [{ tag: 'v0.18.1-rc1', assets: {} }, { tag: 'v0.18.1', assets: [] }, { tag: 'v0.18.1', assets: { x: 'nothex' } }]) {
    assert.throws(() => pendingRelease('freemkv-firmware', JSON.stringify(bad), now), /Invalid pending/);
  }
});
