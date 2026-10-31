import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrapePlaceReviews } from '../../src/collector/place-reviews.js';
import { withFakeMaps, PLACE_URL, FAST } from '../helpers/fake-maps.js';

test('F24: pagination survives a transient empty feed between batches', { timeout: 120_000 }, async () => {
  const res = await withFakeMaps({ total: 40, batch: 10, gapMs: 4000 }, async (ctx) =>
    scrapePlaceReviews(await ctx.newPage(), { url: PLACE_URL, maxReviews: 25, overrides: FAST }));
  assert.equal(res.termination.reason, 'limit-reached', JSON.stringify(res.termination));
  assert.equal(res.reviews.length, 25);
});
