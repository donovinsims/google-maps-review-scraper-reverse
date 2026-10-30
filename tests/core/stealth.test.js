import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFingerprint, pickTimezone, webglOverrideScript } from '../../src/collector/stealth.js';

test('pickFingerprint returns valid UA and viewport', () => {
  const fp = pickFingerprint();
  assert.ok(typeof fp.userAgent === 'string' && fp.userAgent.includes('Chrome/'));
  assert.ok(Array.isArray(fp.brands) && fp.brands.length > 0);
  assert.ok(fp.viewport.width >= 1366 && fp.viewport.width <= 1566);
  assert.ok(fp.viewport.height >= 768 && fp.viewport.height <= 968);
  assert.equal(fp.locale, 'en-US');
  assert.ok(typeof fp.timezoneId === 'string' && fp.timezoneId.startsWith('America/'));
});

test('pickTimezone returns US timezone', () => {
  const tz = pickTimezone();
  assert.ok(tz.startsWith('America/'));
});

test('webglOverrideScript contains WebGL parameter spoofing', () => {
  const script = webglOverrideScript();
  assert.ok(script.includes('Intel Inc.'));
  assert.ok(script.includes('Intel(R) UHD Graphics 630'));
  assert.ok(script.includes('WebGLRenderingContext.prototype.getParameter'));
});
