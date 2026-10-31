import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSignals, jobStatus, matchReview, strength } from '../../src/export/signals.js';

const done = (reason) => ({ placeId: 'p1', inputUrl: 'u', status: 'done', termination: JSON.stringify({ reason }), name: 'Biz' });
const rev = (id, text, extra = {}) => ({ reviewId: id, reviewText: text, publishedDateRaw: '2 weeks ago', publishedDateParsed: '2026-10-17', rating: 2, textTruncated: 0, ...extra });
const topics = (s) => matchReview(rev('r', s)).map((m) => m.topic);

test('explicit topics match stated problems', () => {
  assert.deepEqual(topics('Their website lists the wrong price.'), ['website', 'outdated_info']);
  assert.ok(topics('Called three times and nobody answered.').includes('phone_not_answered'));
  assert.ok(topics('Could not book online, had to call.').includes('booking'));
  assert.ok(topics('No way to order online.').includes('online_ordering'));
  assert.ok(topics('The hours on Google were wrong and it was closed.').includes('hours'));
  assert.ok(topics('Really hard to find the entrance.').includes('hard_to_find'));
  assert.ok(topics('They never showed up for the estimate.').includes('no_show'));
  assert.ok(!topics('They never showed up for the estimate.').includes('booking'));
  assert.ok(topics('He couldn’t commit to coming at all.').includes('booking'));
  assert.deepEqual(topics('Great service, fair price.'), []);
});

test('indirect topics are labelled indirect', () => {
  const m = matchReview(rev('r', 'I wish they had a way to text. Had to call back twice. Could not find their hours anywhere. They are only on Facebook.'));
  const t = Object.fromEntries(m.map((x) => [x.topic, x.kind]));
  assert.equal(t.wish_they_had, 'indirect'); assert.equal(t.had_to_call, 'indirect');
  assert.equal(t.couldnt_find_info, 'indirect'); assert.equal(t.facebook_only, 'indirect');
});

test('pilot false positives are excluded', () => {
  assert.deepEqual(topics('Quality is hard to find but Boves does it everytime.'), []);
  assert.deepEqual(topics('Very Trustworthy which is hard to find when dealing with most shops.'), []);
  assert.deepEqual(topics("It's hard to find enough good things to say about them."), []);
  assert.deepEqual(topics('Another shop just couldn\'t find the issue after 3 tries.'), []);
  assert.deepEqual(topics('Very nice and on time to their scheduled appointment.'), []);
  assert.deepEqual(topics('I called the shop to make an appointment.'), []);
  assert.deepEqual(topics('Called a different place first with no call back.'), []);
  assert.deepEqual(topics("He didn't show much interest in the problem."), []);
  assert.deepEqual(topics("After several other electricians didn't show up, we found them."), []);
  assert.deepEqual(topics('Two times we had to call them out last minute.'), []);
  assert.deepEqual(topics('Because we never heard back we had to call other companies.'), []);
  assert.deepEqual(topics('I looked them up on the Better Business Bureau website.'), []);
  assert.deepEqual(topics('I was left with unanswered questions.'), []);
  assert.deepEqual(topics('Always returned calls within normal business hours.'), []);
});

test('match carries review id, date, kind and quote', () => {
  const [m] = matchReview(rev('abc', 'Nice people. The website was down all week. Good work though.'));
  assert.equal(m.reviewId, 'abc'); assert.equal(m.date, '2026-10-17'); assert.equal(m.kind, 'explicit'); assert.match(m.quote, /website was down/);
});

test('job status: complete, partial, failed', () => {
  assert.equal(jobStatus(done('limit-reached'), []), 'complete');
  assert.equal(jobStatus(done('no-more-reviews'), []), 'complete');
  assert.equal(jobStatus(done('timeout'), []), 'partial');
  assert.equal(jobStatus(done('limit-reached'), [rev('x', 'a', { textTruncated: 1 })]), 'partial');
  assert.equal(jobStatus({ ...done('no-more-reviews'), status: 'partial' }, []), 'partial');
  assert.equal(jobStatus({ ...done('blocked'), status: 'blocked' }, []), 'failed');
  assert.equal(jobStatus({ ...done('x'), status: 'pending', termination: null }, []), 'failed');
});

test('strength: strong, weak, none-found, incomplete', () => {
  assert.equal(strength('complete', [{ kind: 'explicit' }], []), 'strong');
  assert.equal(strength('complete', [{ kind: 'indirect' }], []), 'weak');
  assert.equal(strength('complete', [], [{ topic: 'no_responsiveness_praise' }]), 'weak');
  assert.equal(strength('complete', [], []), 'none-found');
  assert.equal(strength('partial', [{ kind: 'explicit' }], []), 'incomplete');
  assert.equal(strength('failed', [], []), 'incomplete');
});

test('missing responsiveness praise is a business-level indirect signal only on complete scans of 20+', () => {
  const many = Array.from({ length: 20 }, (_, i) => rev('r' + i, 'Good work, fair price.'));
  const s = buildSignals([done('limit-reached')], new Map([['p1', many]]));
  assert.equal(s.businesses[0].businessSignals[0].topic, 'no_responsiveness_praise');
  assert.equal(s.businesses[0].strength, 'weak');
  const praised = [...many.slice(1), rev('z', 'They called me back within an hour.')];
  assert.equal(buildSignals([done('limit-reached')], new Map([['p1', praised]])).businesses[0].businessSignals.length, 0);
  assert.equal(buildSignals([done('timeout')], new Map([['p1', many]])).businesses[0].businessSignals.length, 0);
});

test('incomplete jobs never read as no complaints', () => {
  const s = buildSignals([{ ...done('x'), status: 'failed' }, done('timeout'), done('limit-reached')], new Map([['p1', [rev('a', 'fine')]]]));
  assert.match(s.businesses[0].complaintSummary, /^incomplete/);
  assert.match(s.businesses[1].complaintSummary, /^incomplete/);
  assert.equal(s.businesses[0].strength, 'incomplete');
  assert.equal(s.businesses[2].complaintSummary, 'no keyword matches in scanned reviews');
  for (const b of s.businesses) assert.ok(!/no complaints/i.test(b.complaintSummary));
});

