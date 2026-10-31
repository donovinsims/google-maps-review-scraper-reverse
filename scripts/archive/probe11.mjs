// Probe #11: wait out the sign-in promo, Dismiss it, then paginate.
import { chromium } from 'playwright';
import { S } from '../src/collector/place-reviews.js';
import { sleep } from '../src/collector/util.js';

const searchUrl = process.argv[2];
const browser = await chromium.launch({ headless: true, args: ['--lang=en-US'] });
const context = await browser.newContext({
  locale: 'en-US', timezoneId: 'America/Los_Angeles',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(3000);
const links = page.locator('a[href*="/maps/place/"]');
for (let i = 0; i < Math.min(await links.count(), 12); i++) {
  if (!(await links.nth(i).evaluate((a) => /sponsored/i.test((a.textContent ?? '').slice(0, 120))))) {
    await links.nth(i).click({ timeout: 20000 }); break;
  }
}
await page.waitForURL(/maps\/place\//, { timeout: 30000 });

// Dismiss the sign-in promo whenever it appears (it lags page load).
const promo = page.locator('div[role="dialog"], div[role="presentation"]').filter({ hasText: 'Sign-in to get the best of Google Maps' }).first();
for (let i = 0; i < 12; i++) {
  const dismissIt = promo.getByText('Dismiss').first();
  if ((await dismissIt.count()) > 0) {
    const ok = await dismissIt.click({ timeout: 4000 }).then(() => true).catch(() => false);
    console.log(`promo dismissed (attempt ${i + 1}):`, ok);
    await sleep(800);
    break;
  }
  await sleep(1000);
}
console.log('promo now?', (await promo.count()) > 0);

const countCards = () => page.evaluate(() => document.querySelectorAll('div[data-review-id]').length);
console.log('cards:', await countCards());

const btn = page.locator(S.moreReviews).first();
for (let k = 1; k <= 2; k++) {
  if ((await btn.count()) === 0) break;
  console.log(`more btn label (round ${k}):`, await btn.getAttribute('aria-label'));
  await btn.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => { });
  const clicked = await btn.click({ timeout: 6000 }).then(() => true).catch(() => false);
  if (!clicked) await btn.dispatchEvent('click').catch(() => { });
  await sleep(2500);
  console.log(`cards after click ${k}:`, await countCards());
}
const moreLabel = await btn.getAttribute('aria-label').catch(() => null);
console.log('final more label:', moreLabel);
await page.screenshot({ path: 'data/poc/probe11.png' }).catch(() => { });
await browser.close();
