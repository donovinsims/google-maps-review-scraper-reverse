import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrapePlaceReviews } from '../../src/collector/place-reviews.js';
import { withFakeMaps, PLACE_URL, FAST } from '../helpers/fake-maps.js';

test('F27: hotel-style sort button labelled "Most relevant" still sorts by newest', { timeout: 60_000 }, async () => {
  const res = await withFakeMaps({ total: 30, batch: 10, sortable: true, hotelSort: true, sortRenderMs: 500 }, async (ctx) =>
    scrapePlaceReviews(await ctx.newPage(), { url: PLACE_URL, sortMode: 'newest', maxReviews: 20, overrides: FAST }));
  assert.equal(res.termination.reason, 'limit-reached');
  assert.ok(res.reviews.every((r) => r.reviewId.startsWith('N')));
});
