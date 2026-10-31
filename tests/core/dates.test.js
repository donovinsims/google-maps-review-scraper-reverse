import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prsToDate } from '../../src/core/dates.js';

const NOW = Date.UTC(2026, 9, 30); // Oct 30, 2026

test('V6: relative days produce a dated window', () => {
  const r = prsToDate('2 days ago', NOW);
  assert.equal(r.precision, 'day');
  assert.equal(r.relative, true);
  assert.equal(r.earliest, '2026-10-27T00:00:00.000Z');
  assert.equal(r.latest, '2026-10-28T00:00:00.000Z');
  assert.equal(r.estimate, '2026-10-27T12:00:00.000Z');
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
  assert.equal(r.earliest, '2021-03-04T00:00:00.000Z');
  assert.equal(r.precision, 'day');
  assert.equal(r.relative, false);
});

test('absolute without day "Mar 2021" parses month precision', () => {
  const r = prsToDate('Mar 2021', NOW);
  assert.equal(r.earliest, '2021-03-01T00:00:00.000Z');
  assert.equal(r.precision, 'month');
});

test('ISO "2021-03-04" passes through at day precision', () => {
  const r = prsToDate('2021-03-04', NOW); assert.equal(r.earliest, '2021-03-04T00:00:00.000Z'); assert.equal(r.latest, '2021-03-04T23:59:59.999Z');
});

test('"Edited 3 months ago" prefix is stripped', () => {
  const r = prsToDate('Edited 3 months ago', NOW);
  assert.equal(r.precision, 'month');
  assert.equal(r.edited, true);
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
  assert.equal(r.earliest, '2021-03-04T00:00:00.000Z');
});

test('unknown month names return null', () => {
  assert.equal(prsToDate('Xyz 4, 2021', NOW), null);
});

test('epoch timestamps (number and string) parse to exact ISO minute precision', () => {
  const numEpoch = 1722540159000;
  const parsedNum = prsToDate(numEpoch);
  assert.ok(parsedNum);
  assert.equal(parsedNum.estimate, new Date(numEpoch).toISOString());
  assert.equal(parsedNum.precision, 'minute');
  assert.equal(parsedNum.relative, false);

  const microEpoch = 1722540159000000;
  const parsedMicro = prsToDate(microEpoch);
  assert.ok(parsedMicro);
  assert.equal(parsedMicro.estimate, new Date(numEpoch).toISOString());

  const strEpoch = '1722540159000';
  const parsedStr = prsToDate(strEpoch);
  assert.ok(parsedStr);
  assert.equal(parsedStr.estimate, new Date(numEpoch).toISOString());
});


test('V6: minute/hour abbreviations, calendar validation, edited and German dates', () => {
  assert.equal(prsToDate('5 mins ago',NOW).precision,'minute');
  assert.equal(prsToDate('3 hrs ago',NOW).precision,'hour');
  assert.equal(prsToDate('Edited 3 months ago',NOW).edited,true);
  assert.equal(prsToDate('Bearbeitet: vor 3 Monaten',NOW).edited,true);
  assert.equal(prsToDate('vor einem Jahr',NOW).precision,'year');
  for(const raw of ['2021-02-31','Feb 31, 2021','2021-02-31T12:00:00Z','0 days ago','just now'])assert.equal(prsToDate(raw,NOW),null,raw);
  assert.equal(prsToDate('a month ago',Date.UTC(2024,2,31)).latest,'2024-02-29T00:00:00.000Z');
});
test('V6: reproducible property checks keep midpoint inside UTC windows', () => {
  let seed=42;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<500;i++){
    const n=1+Math.floor(random()*30),unit=['minute','hour','day','week','month','year'][Math.floor(random()*6)];
    const now=Date.UTC(2020+Math.floor(random()*10),Math.floor(random()*12),1+Math.floor(random()*28));
    const r=prsToDate(`${n} ${unit}s ago`,now);
    assert.ok(r && r.earliest<=r.estimate && r.estimate<=r.latest);
    for(const key of ['earliest','latest','estimate'])assert.equal(new Date(r[key]).toISOString(),r[key]);
  }
});
