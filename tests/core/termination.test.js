import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TERMINATIONS, itemStatusFor, aggregateJob, decideTermination } from '../../src/core/termination.js';

test('V1: every reason is mapped and unknown reasons fail loudly', () => {
  for (const reason of Object.keys(TERMINATIONS)) assert.ok(itemStatusFor(reason, { collected: 1 }));
  assert.throws(() => itemStatusFor('made-up-success'), /unknown termination/i);
  assert.equal(itemStatusFor('no-reviews'), 'done');
  assert.equal(itemStatusFor('structure-drift', { collected: 0 }), 'failed');
});
test('V1: aggregation fails for zero items and prioritizes failed over blocked over partial', () => {
  for (const [statuses, status, exitCode] of [[[], 'failed', 1], [['done'], 'completed', 0], [['done','partial'], 'partial', 2], [['blocked','partial'], 'blocked', 3], [['failed','blocked'], 'failed', 1], [['pending'], 'failed', 1]]) {
    assert.deepEqual(aggregateJob(statuses.map(status => ({ status }))), { status, exitCode });
  }
});
test('S3: stalls require recovery and wait; anonymous caps cannot report done', () => {
  const state = { collected: 6, expected: 300, authState: 'anonymous', stalled: true, recoveryDone: true, stalledForMs: 90000, stallTimeoutMs: 90000, elapsedMs: 100000, hardTimeoutMs: 3600000, spinnerVisible: false };
  assert.equal(decideTermination(state), 'anonymous-preview-limit');
  assert.equal(decideTermination({ ...state, recoveryDone: false }), 'continue');
  assert.equal(decideTermination({ ...state, spinnerVisible: true }), 'continue');
  assert.equal(decideTermination({ ...state, authState: 'signed-in' }), 'pagination-stall');
  assert.equal(decideTermination({ ...state, expected: null }), 'pagination-stall');
});
test('S2: only positive end evidence or 98% yield proves exhaustion, with completeness threshold', () => {
  assert.equal(decideTermination({ collected: 0, expected: null }), 'continue');
  assert.equal(decideTermination({ collected: 0, noReviewsDetected: true }), 'no-reviews');
  assert.equal(decideTermination({ collected: 98, expected: 100 }), 'no-more-reviews');
  assert.equal(decideTermination({ collected: 60, expected: 100, endMarkerSeen: true, minCompleteness: .9 }), 'incomplete');
  assert.equal(decideTermination({ collected: 10, expected: 300, limit: 10 }), 'limit-reached');
  assert.equal(decideTermination({ elapsedMs: 100, hardTimeoutMs: 100 }), 'timeout');
});
test('S2: an end marker with zero collected and no confirmed zero-review state cannot succeed',()=>{
  assert.equal(decideTermination({collected:0,expected:null,endMarkerSeen:true}),'structure-unknown');
});
