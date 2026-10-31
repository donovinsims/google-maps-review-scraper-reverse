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

test('F23: a reviewer\'s own trailing "...." is not flagged as truncated', { timeout: 60_000 }, async () => {
  const res = await withFakeMaps({ total: 1, batch: 1, cards: ['<div class="jftiEf" data-review-id="dots"><div class="d4r55">Juan</div><span class="kvMYJc" aria-label="1 star"></span><span class="rsqaWe">6 days ago</span><div class="MyEned"><span class="wiI7pd">bad food overpriced....</span></div></div>'] }, async (ctx) =>
    scrapePlaceReviews(await ctx.newPage(), { url: PLACE_URL, maxReviews: 1, overrides: FAST }));
  assert.equal(res.reviews[0].textTruncated, false);
});
