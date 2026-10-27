import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { legacyCapability, hoardIdentity } from './firmware-published-capabilities.mjs';

const identity = { chip: 'MT1939', vendor: 'HL-DT-ST', model: 'WH14NS40', revision: '1.05', variant: '' };
const args = { file: '/input.bin', output: '/output.bin', hash: 'a'.repeat(64), version: '0.15.3', identity };
const report = () => ({ engine: 'MT1939', chip: 'MT1939', vendor: identity.vendor, model: identity.model,
  rev: identity.revision, modified: true, media: 'BD/UHD', boot_settings: Object.fromEntries(
    ['unrestricted', 'hrl', 'encryption', 'speed', 'region'].map(key => [key, { value: 'oem', supported: key === 'region' }])) });

test('released legacy Modify capabilities come from real builds and accepted settings', async () => {
  const calls = [];
  const run = async command => {
    calls.push(command);
    const value = report();
    if (command.includes('--default')) value.boot_settings.region.value = command.at(-1).split('=')[1];
    return { code: 0, out: JSON.stringify(value), error: '' };
  };
  const result = await legacyCapability({ ...args, run, readOutput: async () => Buffer.from('built') });
  assert.equal(result.status, 'supported');
  assert.equal(result.output_sha256, createHash('sha256').update('built').digest('hex'));
  assert.deepEqual(result.report.boot_settings.region.choices, ['oem', 'free']);
  assert.deepEqual(result.report.boot_settings.unrestricted.choices, []);
  assert.equal(result.report.boot_settings.unrestricted.supported, false);
  assert.equal(calls.length, 3);
  assert.ok(calls[0].includes('--audit'));
  assert.ok(calls.slice(1).every(command => command.includes('--dry-run')));
});

test('legacy failures retain identity but grant no capabilities from the media marker', async () => {
  const result = await legacyCapability({ ...args,
    run: async () => ({ code: 1, out: '', error: 'Diagnostic log: /private/log\nNot enough safe space.\n' }),
    readOutput: async () => { throw new Error('must not read a failed output'); },
  });
  assert.equal(result.status, 'unsupported');
  assert.deepEqual(result.identity, identity);
  assert.equal(result.report, null);
  assert.equal(result.output_sha256, null);
  assert.equal(result.reason, 'Not enough safe space.');
});

test('legacy setting probes fail closed if the released app does not apply a supported setting', async () => {
  await assert.rejects(legacyCapability({ ...args,
    run: async () => ({ code: 0, out: JSON.stringify(report()), error: '' }),
    readOutput: async () => Buffer.from('built'),
  }), /did not apply region=free/);
});

test('fallback identity uses the boot-banner chip and is not a source of capability bits', () => {
  const source = { sha256: args.hash, inquiry: { vendor: 'LG', product: 'WH14NS40', revision: '1.05' },
    mediatek: { banner_chip: 'MT1939', record: { chip_field: 'MT1959', code: 'N123' } } };
  assert.deepEqual(hoardIdentity(source), { chip: 'MT1939', vendor: 'LG', model: 'WH14NS40', revision: '1.05', variant: 'N123' });
  delete source.inquiry.revision;
  assert.throws(() => hoardIdentity(source), /complete identity/);
});
