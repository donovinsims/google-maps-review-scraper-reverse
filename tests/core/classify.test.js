import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyItem } from '../../src/core/status.js';
const r = (reason, n, expected) => ({ termination: { reason }, reviews: Array(n).fill({}), place: { reviewsCount: expected } });

test('F2: stall at 40 of 900 with no-more-reviews is partial, not done', () => assert.equal(classifyItem(r('no-more-reviews', 40, 900)), 'partial'));
test('F2: no-more-reviews with unknown expected count is partial', () => assert.equal(classifyItem(r('no-more-reviews', 40, null)), 'partial'));
test('F2: full collection within tolerance is done', () => assert.equal(classifyItem(r('no-more-reviews', 890, 900)), 'done'));
test('F2: limit reached is done', () => assert.equal(classifyItem(r('limit-reached', 50, 1674)), 'done'));
test('limited-view is blocked; sort-unavailable and place-mismatch are failed', () => {
  assert.equal(classifyItem(r('limited-view', 0, null)), 'blocked');
  assert.equal(classifyItem(r('sort-unavailable', 0, 10)), 'failed');
  assert.equal(classifyItem(r('place-mismatch', 0, null)), 'failed');
});
