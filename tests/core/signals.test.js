import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSignals, jobStatus, matchReview } from '../../src/export/signals.js';

const done = (reason) => ({ placeId: 'p1', inputUrl: 'u', status: 'done', termination: JSON.stringify({ reason }), name: 'Biz' });
const rev = (id, text, extra = {}) => ({ reviewId: id, reviewText: text, publishedDateRaw: '2 weeks ago', publishedDateParsed: '2026-10-17', rating: 2, textTruncated: 0, ...extra });

test('topics match expected phrases', () => {
  const t = (s) => matchReview(rev('r', s)).map((m) => m.topic);
  assert.deepEqual(t('Their website lists the wrong price.'), ['website']);
  assert.ok(t('Called three times and nobody answered.').includes('phone_not_answered'));
  assert.ok(t('Could not book online, had to call.').includes('booking'));
  assert.ok(t('No way to order online.').includes('online_ordering'));
  assert.ok(t('Posted hours said open but they were closed.').includes('hours'));
  assert.ok(t('Really hard to find the entrance.').includes('hard_to_find'));
  assert.deepEqual(t('Great service, fair price.'), []);
});

test('match carries review id, date and quote', () => {
  const [m] = matchReview(rev('abc', 'Nice people. The website was down all week. Good work though.'));
  assert.equal(m.reviewId, 'abc'); assert.equal(m.date, '2026-10-17'); assert.match(m.quote, /website was down/);
});

test('job status: complete, partial, failed', () => {
  assert.equal(jobStatus(done('limit-reached'), []), 'complete');
  assert.equal(jobStatus(done('no-more-reviews'), []), 'complete');
  assert.equal(jobStatus(done('timeout'), []), 'partial');
  assert.equal(jobStatus(done('pagination-stall'), []), 'partial');
  assert.equal(jobStatus(done('limit-reached'), [rev('x', 'a', { textTruncated: 1 })]), 'partial');
  assert.equal(jobStatus({ ...done('no-more-reviews'), status: 'partial' }, []), 'partial');
  assert.equal(jobStatus({ ...done('blocked'), status: 'blocked' }, []), 'failed');
  assert.equal(jobStatus({ ...done('x'), status: 'failed' }, []), 'failed');
  assert.equal(jobStatus({ ...done('x'), status: 'pending', termination: null }, []), 'failed');
});

test('incomplete jobs never read as no complaints', () => {
  const s = buildSignals([{ ...done('x'), status: 'failed' }, done('timeout'), done('limit-reached')],
    new Map([['p1', [rev('a', 'fine')]]]));
  assert.match(s.businesses[0].complaintSummary, /^incomplete/);
  assert.match(s.businesses[1].complaintSummary, /^incomplete/);
  assert.equal(s.businesses[2].complaintSummary, 'no keyword matches in scanned reviews');
  for (const b of s.businesses) assert.ok(!/no complaints/i.test(b.complaintSummary));
});
