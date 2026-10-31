import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { collectForPlaces } from '../../src/cli/runner.js';
import { createStore } from '../../src/core/store.js';

// Stub collector: completes every entry with a limit-reached result, honoring entry.idx.
function stubCollector(seen) {
  return async (entries, _cfg, onComplete) => {
    const out = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const url = typeof e === 'string' ? e : e.url;
      const idx = typeof e === 'string' ? i : e.idx;
      seen.push({ url, idx });
      out.push(await onComplete({ place: { placeId: 'p-' + url, reviewsCount: 1 }, reviews: [{ reviewId: 'r-' + url }], termination: { reason: 'limit-reached' } }, url, idx));
    }
    return out;
  };
}

test('F3: resume keeps original indexes; job_items map one-to-one to input URLs', async () => {
  const db = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gmr-')), 't.db');
  const urls = ['https://u/0', 'https://u/1', 'https://u/2'];
  const store = createStore(db);
  store.createJob({ id: 'job-r', config: { listingUrls: urls }, totalPlaces: 3 });
  store.recordJobItem({ jobId: 'job-r', idx: 0, inputUrl: urls[0], status: 'done' });
  const seen = [];
  const prevExit = process.exitCode;
  await collectForPlaces({ db, resume: 'job-r', listingUrls: urls, collector: stubCollector(seen) });
  process.exitCode = prevExit;
  assert.deepEqual(seen, [{ url: urls[1], idx: 1 }, { url: urls[2], idx: 2 }]);
  const items = createStore(db).getJob('job-r').items;
  assert.equal(items.length, 3);
  items.forEach((it) => assert.equal(it.inputUrl, urls[it.idx]));
});
