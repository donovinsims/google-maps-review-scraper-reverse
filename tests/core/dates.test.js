import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prsToDate } from '../../src/core/dates.js';

const NOW = Date.UTC(2026, 9, 30); // Oct 30, 2026

test('relative days parse with minute precision', () => {
  const r = prsToDate('2 days ago', NOW);
  assert.equal(r.precision, 'day');
  assert.equal(r.relative, true);
  assert.equal(r.iso, '2026-10-28T00:00:00.000Z');
});

test('"a month ago" treats article as 1', () => {
  const r = prsToDate('a month ago', NOW);
  assert.equal(r.precision, 'month');
  assert.equal(r.relative, true);
});

test('"3 weeks ago" parses with week precision', () => {
  const r = prsToDate('3 weeks ago', NOW);
  assert.equal(r.precision, 'week');
});

test('"2 years ago" parses with year precision', () => {
  const r = prsToDate('2 years ago', NOW);
  assert.equal(r.precision, 'year');
});

test('absolute "Mar 4, 2021" parses to day precision', () => {
  const r = prsToDate('Mar 4, 2021', NOW);
  assert.equal(r.iso, '2021-03-04');
  assert.equal(r.precision, 'day');
  assert.equal(r.relative, false);
});

test('absolute without day "Mar 2021" parses month precision', () => {
  const r = prsToDate('Mar 2021', NOW);
  assert.equal(r.iso, '2021-03');
  assert.equal(r.precision, 'month');
});

test('ISO "2021-03-04" passes through at day precision', () => {
  assert.deepEqual(prsToDate('2021-03-04', NOW), { iso: '2021-03-04', precision: 'day', relative: false });
});

test('"Edited 3 months ago" prefix is stripped', () => {
  const r = prsToDate('Edited 3 months ago', NOW);
  assert.equal(r.precision, 'month');
});

test('unsupported strings return null, never fabricated', () => {
  assert.equal(prsToDate(null, NOW), null);
  assert.equal(prsToDate('', NOW), null);
  assert.equal(prsToDate('garbage!!', NOW), null);
  assert.equal(prsToDate('someday', NOW), null);
});

test('non-English month names parse with a locale table', () => {
  const de = { januar: 0, februar: 1, marz: 2, märz: 2, april: 3, mai: 4, juni: 5, juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11 };
  const r = prsToDate('März 4, 2021', NOW, de);
  assert.equal(r.iso, '2021-03-04');
});

test('unknown month names return null', () => {
  assert.equal(prsToDate('Xyz 4, 2021', NOW), null);
});

test('epoch timestamps (number and string) parse to exact ISO minute precision', () => {
  const numEpoch = 1722540159000;
  const parsedNum = prsToDate(numEpoch);
  assert.ok(parsedNum);
  assert.equal(parsedNum.iso, new Date(numEpoch).toISOString());
  assert.equal(parsedNum.precision, 'minute');
  assert.equal(parsedNum.relative, false);

  const microEpoch = 1722540159000000;
  const parsedMicro = prsToDate(microEpoch);
  assert.ok(parsedMicro);
  assert.equal(parsedMicro.iso, new Date(numEpoch).toISOString());

  const strEpoch = '1722540159000';
  const parsedStr = prsToDate(strEpoch);
  assert.ok(parsedStr);
  assert.equal(parsedStr.iso, new Date(numEpoch).toISOString());
});

