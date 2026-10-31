import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('F21: batch launcher defaults to headed unless headless === true', () => {
  const src = fs.readFileSync(new URL('../../src/collector/batch.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('config.headless !== false'), 'headless must not be the implicit default');
  assert.equal((src.match(/headless: config\.headless === true/g) ?? []).length >= 2, true);
});
