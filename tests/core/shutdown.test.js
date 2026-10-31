import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { collectForPlaces } from '../../src/cli/runner.js';
import { createStore } from '../../src/core/store.js';
import { scrapePlaceReviews } from '../../src/collector/place-reviews.js';
import { withFakeMaps, PLACE_URL, FAST } from '../helpers/fake-maps.js';

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gmr-')), 't.db');

test('F4: SIGINT stops after current place, records interrupted item, job interrupted, exit 130', async () => {
  const db = tmpDb();
  const urls = ['https://u/0', 'https://u/1', 'https://u/2'];
  const prev = process.exitCode;
  await collectForPlaces({ db, listingUrls: urls, jobId: 'job-s', collector: async (entries, cfg, onComplete) => {
    const out = [];
    for (let i = 0; i < entries.length; i++) {
      if (cfg.abort.aborted) break;
      if (i === 1) process.emit('SIGINT', 'SIGINT');
      const reason = cfg.abort.aborted ? 'interrupted' : 'limit-reached';
      out.push(await onComplete({ place: { placeId: 'p' + i, reviewsCount: 1 }, reviews: [{ reviewId: 'r' + i }], termination: { reason } }, entries[i], i));
    }
    return out;
  } });
  const code = process.exitCode; process.exitCode = prev;
  assert.equal(code, 130);
  const job = createStore(db).getJob('job-s');
  assert.equal(job.status, 'interrupted');
  assert.deepEqual(job.items.map((i) => i.status), ['done', 'interrupted']);
  assert.equal(createStore(db).countReviews(), 2, 'reviews collected before the signal are persisted');
});

test('F4: stale running job from a dead process is marked interrupted at startup', async () => {
  const db = tmpDb();
  const s = createStore(db);
  s.createJob({ id: 'job-dead', config: { listingUrls: [], pid: 2147480000 } });
  assert.equal(s.markStaleJobs(), 1);
  assert.equal(s.getJob('job-dead').status, 'interrupted');
});

test('F4: scrape loop honors shouldAbort and returns interrupted', { timeout: 60_000 }, async () => {
  const res = await withFakeMaps({ total: 30, batch: 10 }, async (ctx) =>
    scrapePlaceReviews(await ctx.newPage(), { url: PLACE_URL, overrides: { ...FAST, shouldAbort: () => true } }));
  assert.equal(res.termination.reason, 'interrupted');
});
