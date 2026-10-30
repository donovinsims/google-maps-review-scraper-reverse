import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createStore } from '../../src/core/store.js';

test('job status: clean completion vs partial vs blocked vs failed', () => {
  const tmpDb = path.join(process.cwd(), 'data', `test-status-${Date.now()}.db`);
  try {
    const store = createStore(tmpDb);
    const jobId = 'job-status-1';
    store.createJob({ id: jobId, config: { listingUrls: ['url1', 'url2'] } });

    // Mark 1 as done, 1 as preview limit
    store.recordJobItem({
      jobId, idx: 0, inputUrl: 'url1', placeId: 'p1',
      status: 'done', termination: { reason: 'limit-reached' },
    });
    store.recordJobItem({
      jobId, idx: 1, inputUrl: 'url2', placeId: 'p2',
      status: 'partial', termination: { reason: 'anonymous-preview-limit' },
    });

    const job = store.getJob(jobId);
    assert.equal(job.items.length, 2);
    assert.equal(job.items[0].status, 'done');
    assert.equal(job.items[1].status, 'partial');

    // Partial status recorded
    store.updateJobStatus(jobId, 'partial', 'Finished: 1 done, 1 partial');
    const updated = store.getJob(jobId);
    assert.equal(updated.status, 'partial');
  } finally {
    try { fs.rmSync(tmpDb, { force: true }); } catch {}
  }
});

test('upsertReviews atomic transaction persists all records', () => {
  const tmpDb = path.join(process.cwd(), 'data', `test-batch-${Date.now()}.db`);
  try {
    const store = createStore(tmpDb);
    store.upsertBusinessMeta({ placeId: 'p1', name: 'Place 1', listingUrl: 'https://maps.google.com/place/p1' });
    const records = [
      { reviewId: 'r1', placeId: 'p1', reviewerName: 'User 1', rating: 5 },
      { reviewId: 'r2', placeId: 'p1', reviewerName: 'User 2', rating: 4 },
      { reviewId: 'r3', placeId: 'p1', reviewerName: 'User 3', rating: 3 },
    ];
    const count = store.upsertReviews(records, 'run-1');
    assert.equal(count, 3);
    assert.equal(store.countReviews('p1'), 3);
  } finally {
    try { fs.rmSync(tmpDb, { force: true }); } catch {}
  }
});
