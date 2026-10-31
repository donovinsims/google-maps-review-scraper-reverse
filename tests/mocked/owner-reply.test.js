import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'rebrowser-playwright';
import { extractInPage } from '../../src/collector/place-reviews.js';

async function extract(html) {
  const b = await chromium.launch({ headless: true });
  try { const p = await b.newPage(); await p.setContent(html); return await p.locator('div[data-review-id]').first().evaluate(extractInPage); }
  finally { await b.close(); }
}

test('F1: star-only review with owner reply keeps reviewText null', async () => {
  const r = await extract(`<div data-review-id="R1"><div class="d4r55">Ann</div><span class="kvMYJc" aria-label="1 star"></span><span class="rsqaWe">a year ago</span>
    <div class="CDe7pd"><span class="DZSIDd">11 months ago</span><div class="wiI7pd">Thanks for visiting, sorry!</div></div></div>`);
  assert.equal(r.reviewText, null);
  assert.equal(r.ownerResponse, 'Thanks for visiting, sorry!');
});

test('F1 control: review text and owner reply both present stay separate', async () => {
  const r = await extract(`<div data-review-id="R2"><div class="d4r55">Bo</div><span class="kvMYJc" aria-label="5 stars"></span>
    <div class="MyEned"><span class="wiI7pd">Great tacos</span></div>
    <div class="CDe7pd"><span class="DZSIDd">1 week ago</span><div class="wiI7pd">Thank you Bo</div></div></div>`);
  assert.equal(r.reviewText, 'Great tacos');
  assert.equal(r.ownerResponse, 'Thank you Bo');
});
