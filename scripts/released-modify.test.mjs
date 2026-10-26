import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReleasedModify } from '../src/lib/released-modify.mjs';
const sha = 'a'.repeat(64);
const manifest = { producer: { tool: 'freemkv-fw', version: '0.15.4', sha256: sha } };
const release = { tag_name: 'v0.15.4', draft: false, prerelease: false,
  assets: [{ name: 'freemkv-fw-cli-aarch64-macos', digest: `sha256:${sha}` }] };

test('capabilities from the exact released CLI may be deployed', () => {
  assert.equal(validateReleasedModify(manifest, release), 'freemkv-fw-cli-aarch64-macos');
});
test('a dev build with the same version cannot advertise unreleased capabilities', () => {
  assert.throws(() => validateReleasedModify({ producer: { ...manifest.producer, sha256: 'b'.repeat(64) } }, release), /not a published CLI asset/);
});
test('older/newer versions, missing checksums and non-CLI assets cannot be substituted', () => {
  for (const version of ['0.15.3', '0.15.5'])
    assert.throws(() => validateReleasedModify({ producer: { ...manifest.producer, version } }, release), /does not match released/);
  for (const asset of [{ name: 'freemkv-fw-gui-aarch64-macos', digest: `sha256:${sha}` },
                        { name: 'freemkv-fw-cli-aarch64-macos', digest: null }])
    assert.throws(() => validateReleasedModify(manifest, { ...release, assets: [asset] }), /not a published CLI asset/);
  for (const change of [{draft:true}, {prerelease:true}, {tag_name:'invalid'}])
    assert.throws(() => validateReleasedModify(manifest, { ...release, ...change }), /published stable/);
});
