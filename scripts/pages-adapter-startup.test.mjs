import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

let sequence = 0;
// Import the actual Pages adapter. Only its dependencies are stubbed, so these
// checks exercise module evaluation and the adapter's real cache assignments.
async function adapter(name, state) {
  const key = `__pagesAdapterStartup${++sequence}`;
  globalThis[key] = state;
  const url = new URL(`../functions/api/${name}.js`, import.meta.url).href;
  const exports = {
    'finder.mjs': ['buildFinderData', 'finderPageData'],
    'firmware-verification-catalog.mjs': ['verificationCatalog'],
    'firmware-verification.mjs': ['firmwareVerification'],
    'firmware-download.mjs': ['downloadAllowlist', 'firmwareDownload'],
    'firmware-origin.mjs': ['validateOriginDetails'],
  };
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!context.parentURL?.startsWith(url)) return nextResolve(specifier, context);
      const filename = specifier.split('/').at(-1);
      const source = filename.endsWith('.json')
        ? `export default globalThis[${JSON.stringify(key)}].fixtures[${JSON.stringify(filename)}];`
        : exports[filename]?.map(name => `export function ${name}(...args) { return globalThis[${JSON.stringify(key)}].${name}(...args); }`).join('\n');
      assert.ok(source, `Unexpected adapter dependency: ${specifier}`);
      return {url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true};
    },
  });
  try {
    return await import(`${url}?startup-test=${sequence}`);
  } finally {
    hook.deregister();
  }
}

function fixtures() {
  return Object.fromEntries(['finder-catalog.json', 'firmware-index.json', 'pioneer-firmware-index.json', 'crossflash-links.json'].map(name => [name, {name}]));
}

test('verification adapter defers catalogue construction, caches success and retries failed initialization', async () => {
  const events = [];
  const built = {}, page = {}, catalog = new Map();
  let fail = true;
  const state = {
    fixtures: fixtures(),
    buildFinderData(input) {
      events.push('build');
      assert.deepEqual(input, {catalog: state.fixtures['finder-catalog.json'], mediatek: state.fixtures['firmware-index.json'], crossflash: state.fixtures['crossflash-links.json']});
      return built;
    },
    finderPageData(input, options) {
      events.push('page');
      assert.equal(input, built);
      assert.deepEqual(options, {legacy: state.fixtures['pioneer-firmware-index.json'], keys: false});
      return page;
    },
    verificationCatalog(input) {
      events.push('catalog');
      assert.equal(input, page);
      if (fail) { fail = false; throw new Error('catalog failure'); }
      return catalog;
    },
    firmwareVerification(request, env, input) {
      events.push('handle');
      assert.equal(input, catalog);
      return {request, env};
    },
  };
  const {onRequest} = await adapter('firmware-verification', state);
  assert.deepEqual(events, [], 'import must not construct the catalogue');
  const first = {request: {}, env: {}};
  assert.throws(() => onRequest(first), /catalog failure/);
  assert.deepEqual(events, ['build', 'page', 'catalog']);
  assert.deepEqual(onRequest(first), first);
  const second = {request: {}, env: {}};
  assert.deepEqual(onRequest(second), second);
  assert.deepEqual(events, ['build', 'page', 'catalog', 'build', 'page', 'catalog', 'handle', 'handle']);
});

for (const failureStage of ['validate', 'allowlist']) {
  test(`download adapter defers validation, caches success and retries ${failureStage} failure`, async () => {
    const events = [], allowlist = {};
    let fail = true;
    const state = {
      fixtures: fixtures(),
      validateOriginDetails(input) {
        events.push('validate');
        assert.equal(input, state.fixtures['finder-catalog.json']);
        if (failureStage === 'validate' && fail) { fail = false; throw new Error('validation failure'); }
      },
      downloadAllowlist(input) {
        events.push('allowlist');
        assert.deepEqual(input, {catalog: state.fixtures['finder-catalog.json']});
        if (failureStage === 'allowlist' && fail) { fail = false; throw new Error('allowlist failure'); }
        return allowlist;
      },
      firmwareDownload(request, env, input) {
        events.push('handle');
        assert.equal(input, allowlist);
        return {request, env};
      },
    };
    const {onRequest} = await adapter('firmware-download', state);
    assert.deepEqual(events, [], 'import must not validate or build the allowlist');
    assert.throws(() => onRequest({request: {}, env: {}}), /failure/);
    assert.deepEqual(events, failureStage === 'validate' ? ['validate'] : ['validate', 'allowlist']);
    events.length = 0;
    const first = {request: {}, env: {}};
    assert.deepEqual(onRequest(first), first);
    const second = {request: {}, env: {}};
    assert.deepEqual(onRequest(second), second);
    assert.deepEqual(events, ['validate', 'allowlist', 'handle', 'handle']);
  });
}
