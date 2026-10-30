import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from '../../src/core/retry.js';

test('withRetry succeeds on first attempt', async () => {
  let calls = 0;
  const res = await withRetry(async (attempt) => {
    calls++;
    return `success-${attempt}`;
  });
  assert.equal(calls, 1);
  assert.equal(res, 'success-1');
});

test('withRetry succeeds on second attempt', async () => {
  let calls = 0;
  const res = await withRetry(async (attempt) => {
    calls++;
    if (attempt === 1) throw new Error('transient');
    return 'ok';
  }, { baseDelayMs: 10, maxDelayMs: 50 });
  assert.equal(calls, 2);
  assert.equal(res, 'ok');
});

test('withRetry respects maxAttempts', async () => {
  let calls = 0;
  await assert.rejects(
    async () => {
      await withRetry(async () => {
        calls++;
        throw new Error('permanent');
      }, { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 20 });
    },
    /permanent/
  );
  assert.equal(calls, 3);
});

test('withRetry skips non-retryable errors', async () => {
  let calls = 0;
  await assert.rejects(
    async () => {
      await withRetry(
        async () => {
          calls++;
          throw new Error('fatal sign-in-wall');
        },
        {
          maxAttempts: 4,
          baseDelayMs: 5,
          retryableError: (err) => !err.message.includes('sign-in-wall'),
        }
      );
    },
    /fatal sign-in-wall/
  );
  assert.equal(calls, 1);
});
