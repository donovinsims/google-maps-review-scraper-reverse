import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { collectForPlaces } from '../../src/cli/runner.js';
import { openDb } from '../../src/core/db.js';

test('F6: busy_timeout is set on every connection', () => {
  const db = openDb(':memory:');
  assert.equal(Object.values(db.prepare('PRAGMA busy_timeout').get())[0], 5000);
});

test('F6: a streaming DB write failure marks the item failed (db-error), not done', async () => {
  const db = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gmr-')), 't.db');
  // Force the stream write to throw by passing a reviews array that breaks normalization.
  const throwing = async (entries, cfg, onComplete, onBatch) => {
    await onBatch({ place: { placeId: 'p' }, get reviews() { throw new Error('disk I/O error'); } }, 'https://u/0', 0);
    return [await onComplete({ place: { placeId: 'p', reviewsCount: 1 }, reviews: [{ reviewId: 'r' }], termination: { reason: 'limit-reached' } }, 'https://u/0', 0)];
  };
  const prev = process.exitCode;
  await collectForPlaces({ db, listingUrls: ['https://u/0'], collector: throwing });
  process.exitCode = prev;
  const items = openDb(db).prepare('SELECT * FROM job_items').all();
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'failed');
  assert.match(items[0].error, /streaming DB write failed: disk I\/O error/);
});
