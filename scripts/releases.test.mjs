import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRelease } from '../src/lib/releases.mjs';
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
