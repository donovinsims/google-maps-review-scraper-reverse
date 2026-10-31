import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrapePlaceReviews } from '../../src/collector/place-reviews.js';
import { withFakeMaps, PLACE_URL, FAST } from '../helpers/fake-maps.js';

test('F23: every "See more" is expanded even though clicked buttons disappear', { timeout: 60_000 }, async () => {
  const res = await withFakeMaps({ total: 6, batch: 6, truncate: true }, async (ctx) =>
    scrapePlaceReviews(await ctx.newPage(), { url: PLACE_URL, maxReviews: 6, overrides: FAST }));
  assert.equal(res.reviews.length, 6);
  for (const r of res.reviews) {
    assert.equal(r.reviewText, `Full text of ${r.reviewId}`);
    assert.equal(r.textTruncated, false);
  }
});

test('F23: text that cannot be expanded is flagged textTruncated, never stored as complete', { timeout: 60_000 }, async () => {
  const res = await withFakeMaps({ total: 3, batch: 3, truncate: true, brokenExpand: true }, async (ctx) =>
    scrapePlaceReviews(await ctx.newPage(), { url: PLACE_URL, maxReviews: 3, overrides: FAST }));
  assert.ok(res.reviews.length > 0);
  assert.ok(res.reviews.every((r) => r.textTruncated === true));
});
