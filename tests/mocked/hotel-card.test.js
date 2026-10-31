import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrapePlaceReviews } from '../../src/collector/place-reviews.js';
import { withFakeMaps, PLACE_URL, FAST } from '../helpers/fake-maps.js';

const hotelCard = '<div class="jftiEf" data-review-id="H1"><div class="d4r55">Hotel Guest</div>'
  + '<div class="DU9Pgb"><span class="fzvQIb">4/5</span><span class="xRkPPb">2 months ago on <span class="qmhsmd">Google</span></span></div>'
  + '<div class="MyEned"><span class="wiI7pd">Nice stay.</span></div>'
  + '<div class="CDe7pd"><span class="DZSIDd">a month ago</span><div class="wiI7pd">Thanks for staying!</div></div></div>';

test('F28: hotel review cards keep the review date (xRkPPb, source suffix removed)', { timeout: 60_000 }, async () => {
  const res = await withFakeMaps({ total: 1, batch: 1, cards: [hotelCard] }, async (ctx) =>
    scrapePlaceReviews(await ctx.newPage(), { url: PLACE_URL, maxReviews: 1, overrides: FAST }));
  const r = res.reviews[0];
  assert.equal(r.publishedDateRaw, '2 months ago');
  assert.equal(r.rating, 4);
  assert.equal(r.reviewText, 'Nice stay.');
  assert.equal(r.ownerResponseDateRaw, 'a month ago');
});
