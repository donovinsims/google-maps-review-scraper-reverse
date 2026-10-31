import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createStore } from '../../src/core/store.js';

const tmpDb = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gmr-')), 't.db');
const rec = (extra = {}) => ({ placeId: 'p1', reviewId: 'r1', reviewText: 'hi', ...extra });
const row = (s) => s.selectReviews({ placeId: 'p1' })[0];

test('F25: double upsert in one run counts the review once; a new run counts again', () => {
  const s = createStore(tmpDb());
  s.upsertBusinessMeta({ placeId: 'p1', listingUrl: 'https://u' });
  s.upsertReviews([rec()], 'run-a');
  s.upsertReviews([rec()], 'run-a');
  assert.equal(row(s).collectedCount, 1);
  s.upsertReviews([rec()], 'run-b');
  assert.equal(row(s).collectedCount, 2);
});

test('F7: re-collecting a relative date keeps the first parsed date', () => {
  const s = createStore(tmpDb());
  s.upsertBusinessMeta({ placeId: 'p1', listingUrl: 'https://u' });
  s.upsertReviews([rec({ publishedDateRaw: '2 months ago', publishedDateParsed: '2026-08-31T00:00:00.000Z',
    ownerResponseDateRaw: 'a month ago', ownerResponseDateParsed: '2026-09-30T00:00:00.000Z' })], 'run-a');
  s.upsertReviews([rec({ publishedDateRaw: '2 months ago', publishedDateParsed: '2026-09-20T00:00:00.000Z',
    ownerResponseDateRaw: 'a month ago', ownerResponseDateParsed: '2026-10-20T00:00:00.000Z' })], 'run-b');
  assert.equal(row(s).publishedDateParsed, '2026-08-31T00:00:00.000Z');
  assert.equal(row(s).ownerResponseDateParsed, '2026-09-30T00:00:00.000Z');
  s.upsertReviews([rec({ publishedDateRaw: '3 months ago', publishedDateParsed: '2026-07-20T00:00:00.000Z' })], 'run-c');
  assert.equal(row(s).publishedDateParsed, '2026-07-20T00:00:00.000Z');
});
