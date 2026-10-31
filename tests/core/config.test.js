import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseRunOptions, validateListingUrl } from '../../src/core/config.js';

test('D: importing program, runner and dashboard does not parse argv or open resources', () => {
  const script = `process.argv = ['node', 'test', 'junk-command'];
    await import('./src/cli/program.js'); await import('./src/cli/runner.js');
    await import('./src/dashboard/server.js'); console.log('imported');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('../../', import.meta.url), encoding: 'utf8', timeout: 5000,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'imported\n');
  assert.equal(result.stderr, '');
});

test('V2: invalid numeric options are usage errors rather than unlimited or zero workers', () => {
  for (const options of [{ limit: 'abc' }, { limit: 0 }, { limit: 1.5 },
    { concurrency: 'abc' }, { concurrency: 0 }, { concurrency: 5 },
    { minCompleteness: 1.1 }, { delayMs: '8000,3000' }, { placeTimeoutMin: 0 }]) {
    assert.throws(() => parseRunOptions(options), error => error.exitCode === 64);
  }
});

test('V2: sort aliases, region, language and profile false are normalized', () => {
  for (const [sort, expected] of Object.entries({ highest_rating: 'highest', lowest_rating: 'lowest', 'most-relevant': 'relevant', relevant: 'relevant', default: 'default' })) {
    assert.equal(parseRunOptions({ sort }).sort, expected);
  }
  assert.throws(() => parseRunOptions({ sort: 'oldest' }), /newest.*relevant.*highest.*lowest.*default/);
  assert.throws(() => parseRunOptions({ language: 'english' }), /language/);
  assert.equal(parseRunOptions({ profile: 'false' }).profile, false);
  assert.equal(parseRunOptions({ language: 'de', region: 'de' }).region, 'de');
  assert.deepEqual(parseRunOptions({}).delayMs, [3000, 8000]);
});

test('V2: only HTTP(S) Google Maps URLs are accepted, with strict host boundaries', () => {
  for (const url of ['https://www.google.com/maps/place/Test', 'https://maps.google.com/maps/search/Test', 'https://maps.app.goo.gl/abc']) assert.equal(validateListingUrl(url), true);
  for (const url of ['garbage', 'https://evilgoogle.com/maps/place/Test', 'https://google.com.evil.test/maps/place/Test', 'file:///maps/place/Test', 'https://user:password@google.com/maps/place/Test']) assert.equal(validateListingUrl(url), false);
  assert.throws(() => parseRunOptions({ proxy: 'invalid' }), /proxy/);
});

test('D: CLI uses exit 64 for invalid options and invalid export formats', () => {
  for (const args of [['run', 'https://google.com/maps/place/Test', '--limit', 'abc'], ['export', '--format', 'xml']]) {
    const result = spawnSync(process.execPath, ['src/cli/index.js', ...args], { cwd: new URL('../../', import.meta.url), encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 64, result.stderr);
  }
});
