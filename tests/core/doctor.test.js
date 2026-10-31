import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doctor } from '../../src/cli/doctor.js';

test('doctor: reports all individual checks when browser launch succeeds', async () => {
  const deps = {
    launchWithFallback: async () => ({ resource: { newContext: async () => ({ close: async () => {} }), close: async () => {} }, channel: 'chrome' }),
    detectAuthState: async () => 'signed-in',
  };
  const result = await doctor({ db: ':memory:', profile: 'fake-profile' }, deps);
  assert.equal(result.checks.length, 6);
  const names = result.checks.map(c => c.name);
  assert.deepEqual(names, ['Node >=22.13', 'node:sqlite', 'Database writable', 'Profile exists', 'Browser executable', 'Signed in']);
  assert.ok(result.checks.find(c => c.name === 'Browser executable').pass);
  assert.ok(result.checks.find(c => c.name === 'Signed in').pass);
});

test('doctor: separately reports Browser executable and Signed in on launch failure', async () => {
  const deps = {
    launchWithFallback: async () => { throw new Error('Cannot find chrome binary'); },
  };
  const result = await doctor({ db: ':memory:', profile: 'default' }, deps);
  const browserCheck = result.checks.find(c => c.name === 'Browser executable');
  const signedInCheck = result.checks.find(c => c.name === 'Signed in');
  assert.ok(browserCheck, 'Browser executable check must exist');
  assert.equal(browserCheck.pass, false);
  assert.match(browserCheck.detail, /chrome binary/);
  assert.ok(signedInCheck, 'Signed in check must exist separately');
  assert.equal(signedInCheck.pass, false);
  assert.equal(signedInCheck.detail, 'Browser launch failed');
  assert.equal(result.ok, false);
});
