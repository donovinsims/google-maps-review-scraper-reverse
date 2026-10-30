import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/core/store.js';
import { normalizeReview, normalizeRating } from '../../src/core/normalize.js';
import { toCsv, toJsonExport, EXPORT_SCHEMA_VERSION } from '../../src/export/exporters.js';

// --- Mocked adapter -------------------------------------------------------
function fakeReviews() {
  return [
    { reviewId: 'r1', placeId: 'p1', reviewerName: 'Alice ⭐', ratingRaw: '5 stars',
      reviewText: 'Great place! 😊', publishedDateRaw: '3 months ago',
      publishedDateParsed: { date: '2026-07-30', precision: 'month' },
      ownerResponse: 'Thanks!', ownerResponseDateRaw: '3 months ago',
      ownerResponseDateParsed: { date: '2026-07-30', precision: 'month' } },
    { reviewId: 'r2', placeId: 'p1', reviewerName: 'Bob', ratingRaw: '4 stars', reviewText: null },
    { reviewId: 'r3', placeId: 'p1', reviewerName: null, ratingRaw: '5 stars', reviewText: '👍' },
  ];
}

test('normalizeRating extracts 1-5 from English labels', () => {
  assert.equal(normalizeRating('5 stars').rating, 5);
  assert.equal(normalizeRating('1 star').rating, 1);
  assert.equal(normalizeRating(4).rating, 4);
  assert.equal(normalizeRating(null).rating, null);
  assert.equal(normalizeRating('xxgarbled').rating, null);
  assert.equal(normalizeRating('xxgarbled').ratingRaw, 'xxgarbled');
});

test('normalizeReview preserves null for all missing fields', () => {
  const { record } = normalizeReview({ reviewId: 'x', placeId: 'p1' });
  assert.equal(record.reviewerName, null);
  assert.equal(record.reviewText, null);
  assert.equal(record.rating, null);
  assert.equal(record.translatedByGoogle, null);
});

test('normalizeReview keeps unicode and emojis intact', () => {
  const { record } = normalizeReview({ reviewId: 'u', placeId: 'p1', reviewText: '中文 + émojis 🚀' });
  assert.equal(record.reviewText, '中文 + émojis 🚀');
});

// --- Store: dedupe, upsert, meta, retention -------------------------------
function memoryStore() { return createStore(':memory:'); }
function withParentPlace(s, placeId = 'p1') {
  s.upsertBusinessMeta({ placeId, name: 'Biz', listingUrl: `http://g.maps/${placeId}`, rating: 4.2 });
  return s;
}

test('store dedupes on (placeId, reviewId) and enriches on re-collection', () => {
  const s = withParentPlace(memoryStore());
  const norm = fakeReviews().map((r) => normalizeReview(r).record);
  for (const r of norm) s.upsertReview(r, 'run-a');
  // second run: same review is an update, not a new row — collectedCount grows
  s.upsertReview({ ...norm[0], reviewText: 'Great place! 😊 edited' }, 'run-b');
  assert.equal(s.countReviews('p1'), 3);
  const all = s.selectReviews({ placeId: 'p1' });
  const r1 = all.find((x) => x.reviewId === 'r1');
  assert.equal(r1.collectedCount, 2);
});

test('ratingOnly review persists text=null without fabrication', () => {
  const s = withParentPlace(memoryStore());
  const { record } = normalizeReview({ reviewId: 'x', placeId: 'p1', ratingRaw: '4 stars', reviewText: null });
  s.upsertReview(record, null);
  assert.equal(s.selectReviews({ placeId: 'p1' })[0].reviewText, null);
  assert.equal(s.selectReviews({ placeId: 'p1' })[0].rating, 4);
});

test('store deleteReviews removes place and its reviews', () => {
  const s = memoryStore();
  s.upsertBusinessMeta({ placeId: 'del', name: 'Del biz', listingUrl: 'http://g.maps/del', rating: 4 });
  for (const r of fakeReviews().map((r) => normalizeReview({ ...r, placeId: 'del' }).record)) s.upsertReview(r, null);
  s.deleteReviews('del');
  assert.equal(s.countReviews('del'), 0);
  assert.equal(s.selectPlaces().length, 0);
});

test('business meta is upserted idempotently', () => {
  const s = memoryStore();
  s.upsertBusinessMeta({ placeId: 'p1', name: 'Biz A', listingUrl: 'http://g.maps/x', rating: 4.1 });
  s.upsertBusinessMeta({ placeId: 'p1', name: 'Biz A', listingUrl: 'http://g.maps/x', rating: 4.2 });
  assert.equal(s.selectPlaces().length, 1);
  assert.equal(s.selectPlaces()[0].rating, 4.2);
});

// --- Export: CSV safety + JSON versioning ---------------------------------
test('CSV neutralizes formula injection', () => {
  const csv = toCsv([{ reviewText: '=cmd()| \'/C calc', reviewerName: '+evil' }]);
  assert.ok(csv.includes("'=cmd"), 'must prefix = with an apostrophe');
  assert.ok(csv.includes("'+evil"), 'must prefix + with an apostrophe');
});

test('CSV quotes fields containing commas and quotes', () => {
  const csv = toCsv([{ reviewText: 'a,b "quote"', reviewerName: 'x' }]);
  assert.ok(csv.includes('"a,b ""quote"""'), `got: ${csv}`);
});

test('JSON export carries explicit schemaVersion', () => {
  const j = JSON.parse(toJsonExport([{ reviewId: 'r1', placeId: 'p1' }]));
  assert.equal(j.schemaVersion, EXPORT_SCHEMA_VERSION);
  assert.ok(j.exportedAt);
  assert.ok(Array.isArray(j.reviews));
});

test('rating normalization handles null and out-of-range without fabrication', () => {
  assert.equal(normalizeRating(0).rating, null);
  assert.equal(normalizeRating(6).rating, null);
  assert.equal(normalizeRating('0 stars').rating, null);
  assert.equal(normalizeRating('not-a-rating').rating, null);
});

// --- Job state & lifecycle tests ------------------------------------------
test('store records and updates job lifecycle in SQLite', () => {
  const s = memoryStore();
  const jobId = 'job-test-1';
  s.createJob({ id: jobId, config: { limit: 10 }, totalPlaces: 2 });
  const initial = s.getJob(jobId);
  assert.equal(initial.id, jobId);
  assert.equal(initial.status, 'running');
  assert.equal(initial.totalPlaces, 2);
  assert.equal(initial.config?.limit, 10);

  s.recordJobItem({ jobId, idx: 0, inputUrl: 'http://test/1', placeId: 'p1', status: 'done' });
  s.recordJobItem({ jobId, idx: 1, inputUrl: 'http://test/2', placeId: null, status: 'failed', error: 'not found' });

  const withItems = s.getJob(jobId);
  assert.equal(withItems.items.length, 2);
  assert.equal(withItems.items[0].status, 'done');
  assert.equal(withItems.items[1].status, 'failed');

  s.updateJobStatus(jobId, 'completed', 'all done');
  const finished = s.getJob(jobId);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.notes, 'all done');

  const recents = s.selectRecentJobs(5);
  assert.equal(recents.length, 1);
  assert.equal(recents[0].id, jobId);
});

test('isPlaceCollected correctly detects existing places within threshold', () => {
  const s = memoryStore();
  assert.equal(s.isPlaceCollected('none'), false);
  s.upsertBusinessMeta({ placeId: 'biz1', name: 'Biz 1', listingUrl: 'http://maps/biz1' });
  assert.equal(s.isPlaceCollected('biz1'), true);
});

test('profile directory helpers sanitize names and resolve expected path', async () => {
  const { getProfileDir, hasSavedProfile } = await import('../../src/collector/browser.js');
  const dir = getProfileDir('/mock/root', 'my-team!@#');
  assert.ok(dir.includes('my-team___'));
  assert.equal(hasSavedProfile('/nonexistent/path', 'default'), false);
});

