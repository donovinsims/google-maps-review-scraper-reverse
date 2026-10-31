import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isRetryable } from '../../src/collector/batch.js';

test('F4: no retry once shutdown was requested', () => {
  const closed = new Error('locator.count: Target page, context or browser has been closed');
  assert.equal(isRetryable(closed, { aborted: false }), true);
  assert.equal(isRetryable(closed, { aborted: true }), false);
  assert.equal(isRetryable(new Error('sign-in-wall'), null), false);
});

test('F4: browser launches leave signal handling to the runner', () => {
  const src = fs.readFileSync(new URL('../../src/collector/batch.js', import.meta.url), 'utf8');
  assert.equal((src.match(/handleSIGINT: false/g) || []).length, 2);
});
