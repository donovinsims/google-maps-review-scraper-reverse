import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPage } from '../../src/core/health.js';

test('classifyPage identifies blocked pages', () => {
  assert.equal(classifyPage('https://www.google.com/sorry/index?continue=...'), 'blocked');
  assert.equal(classifyPage('https://www.google.com/maps?unusual_traffic=1'), 'blocked');
});

test('classifyPage identifies sign-in walls', () => {
  assert.equal(classifyPage('https://accounts.google.com/ServiceLogin?service=maps'), 'sign-in-wall');
  assert.equal(classifyPage('https://accounts.google.com/v3/signin/identifier'), 'sign-in-wall');
});

test('classifyPage identifies captchas in snippet', () => {
  assert.equal(classifyPage('https://www.google.com/maps', 'Please solve this recaptcha challenge'), 'captcha');
});

test('classifyPage identifies normal pages as ok', () => {
  assert.equal(classifyPage('https://www.google.com/maps/place/The+French+Laundry'), 'ok');
});
