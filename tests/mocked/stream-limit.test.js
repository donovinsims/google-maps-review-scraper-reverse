import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrapePlaceReviews } from '../../src/collector/place-reviews.js';
import { withFakeMaps, PLACE_URL, FAST } from '../helpers/fake-maps.js';

test('F26: streamed batches never exceed maxReviews', { timeout: 60_000 }, async () => {
  let streamed = 0;
  const res = await withFakeMaps({ total: 30, batch: 10 }, async (ctx) =>
    scrapePlaceReviews(await ctx.newPage(), { url: PLACE_URL, maxReviews: 15, overrides: FAST },
      (ev, d) => { if (ev === 'stream-batch') streamed += d.reviews.length; }));
  assert.equal(res.reviews.length, 15);
  assert.equal(streamed, 15);
});
