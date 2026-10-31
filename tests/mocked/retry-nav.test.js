import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrapePlaceReviews } from '../../src/collector/place-reviews.js';
import { withFakeMaps, PLACE_URL, FAST } from '../helpers/fake-maps.js';

const OTHER = 'https://www.google.com/maps/place/Other+Place/@1,1,17z/data=!3m1!4b1!4m6!3m5!1s0x9999:0x8888!8m2!3d1!4d1';

test('F5: a page left on another Maps place is navigated to the requested place', { timeout: 60_000 }, async () => {
  const res = await withFakeMaps({ total: 3, batch: 3 }, async (ctx) => {
    const page = await ctx.newPage();
    await page.goto(OTHER);
    return scrapePlaceReviews(page, { url: PLACE_URL, maxReviews: 3, overrides: FAST });
  });
  assert.equal(res.place.placeId, '0x1111:0x2222');
});
