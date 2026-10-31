import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrapePlaceReviews, placeMismatch } from '../../src/collector/place-reviews.js';
import { withFakeMaps, PLACE_URL, FAST } from '../helpers/fake-maps.js';

test('F22: a different business heading terminates with place-mismatch and stores nothing', { timeout: 60_000 }, async () => {
  const res = await withFakeMaps({ name: 'Somewhere Else Diner', total: 3, batch: 3 }, async (ctx) =>
    scrapePlaceReviews(await ctx.newPage(), { url: PLACE_URL, maxReviews: 3, overrides: FAST }));
  assert.equal(res.termination.reason, 'place-mismatch');
  assert.equal(res.reviews.length, 0);
});

test('F22: matching rules', () => {
  const u = 'https://www.google.com/maps/place/Lucha+Cantina/@42,-89,17z/data=!4m6!3m5!1s0x1:0x2';
  assert.equal(placeMismatch('Lucha Cantina', u), null);
  assert.equal(placeMismatch('LUCHA CANTINA - Rockford', u), null);
  assert.match(placeMismatch(null, u), /no business name/);
  assert.match(placeMismatch('Olive Garden', u), /does not match/);
  assert.equal(placeMismatch('Caf\u00e9 Lux', 'https://www.google.com/maps/place/Cafe+Lux/@1,1'), null);
});
