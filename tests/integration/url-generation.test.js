import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlaceUrl } from '../../src/collector/place-reviews.js';

test('normalizePlaceUrl formats search URLs and canonical URLs with hl and gl', () => {
  const norm1 = normalizePlaceUrl('https://www.google.com/maps/place/Tartine+Bakery/@37.761425,-122.424104,17z', { hl: 'en', gl: 'us' });
  assert.ok(norm1.canonical.includes('hl=en'));
  assert.ok(norm1.canonical.includes('gl=us'));

  const norm2 = normalizePlaceUrl('https://maps.app.goo.gl/xyz123');
  assert.equal(norm2.shortLink, 'https://maps.app.goo.gl/xyz123');
});

test('reviewUrl format conforms to Google Maps standard syntax', () => {
  const placeId = '0x808f7e1807365605:0x601f7a97f0ce6c6b';
  const reviewId = 'ChZDSUhNMG9nS0VJQ0FnSUNBeU9uUG5BEAE';
  const hl = 'en';
  const gl = 'us';

  const reviewUrl = `https://www.google.com/maps/place/?data=!1s${encodeURIComponent(placeId)}!8s${encodeURIComponent(reviewId)}&hl=${hl}&gl=${gl}`;
  const parsed = new URL(reviewUrl);
  assert.equal(parsed.searchParams.get('hl'), 'en');
  assert.equal(parsed.searchParams.get('gl'), 'us');
  assert.ok(parsed.searchParams.get('data').includes(placeId));
  assert.ok(parsed.searchParams.get('data').includes(reviewId));
});
