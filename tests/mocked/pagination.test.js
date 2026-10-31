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

test('F24: newest sort waits for the re-rendered feed and collects re-sorted reviews', { timeout: 120_000 }, async () => {
  const res = await withFakeMaps({ total: 30, batch: 10, sortable: true, sortRenderMs: 2500 }, async (ctx) =>
    scrapePlaceReviews(await ctx.newPage(), { url: PLACE_URL, sortMode: 'newest', maxReviews: 15, overrides: FAST }));
  assert.equal(res.termination.reason, 'limit-reached', JSON.stringify(res.termination));
  assert.equal(res.reviews[0].reviewId, 'N0');
  assert.ok(res.reviews.every((r) => r.reviewId.startsWith('N')), 'no pre-sort reviews collected');
});

test('F24: missing sort option terminates sort-unavailable instead of silently using default order', { timeout: 120_000 }, async () => {
  const res = await withFakeMaps({ total: 30, batch: 10, sortable: false }, async (ctx) =>
    scrapePlaceReviews(await ctx.newPage(), { url: PLACE_URL, sortMode: 'newest', maxReviews: 15, overrides: FAST }));
  assert.equal(res.termination.reason, 'sort-unavailable');
});
