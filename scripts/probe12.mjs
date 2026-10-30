// Probe #12: keyboard activation + dialog dump after More-reviews attempts.
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
page.on('dialog', () => { });
await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(3000);
const links = page.locator('a[href*="/maps/place/"]');
for (let i = 0; i < Math.min(await links.count(), 12); i++) {
  if (!(await links.nth(i).evaluate((a) => /sponsored/i.test((a.textContent ?? '').slice(0, 120))))) {
    await links.nth(i).click({ timeout: 20000 }); break;
  }
}
await page.waitForURL(/maps\/place\//, { timeout: 30000 });
await page.waitForTimeout(2000);

// dismiss promo if present
const promo = page.locator('div[role="dialog"], div[role="presentation"]').filter({ hasText: 'Sign-in to get the best of Google Maps' }).first();
if ((await promo.count()) > 0) {
  await promo.getByText('Dismiss').first().click({ timeout: 3000 }).catch(() => { });
  await sleep(800);
}

const countCards = () => page.evaluate(() => document.querySelectorAll('div[data-review-id]').length);
console.log('cards:', await countCards());

const btn = page.locator(S.moreReviews).last();
// Keyboard path: focus + Enter
await btn.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => { });
await btn.focus();
await page.keyboard.press('Enter');
await sleep(2500);
console.log('cards after Enter:', await countCards());

// Dump the dialog tree contents
const dump = await page.evaluate(() => [...document.querySelectorAll('div[role="dialog"]')].map((d) => ({
  ariaLabel: d.getAttribute('aria-label'),
  cls: String(d.className).slice(0, 40),
  cards: d.querySelectorAll('div[data-review-id]').length,
  text: (d.textContent ?? '').slice(0, 120),
})));
console.log(JSON.stringify(dump, null, 2));
await page.screenshot({ path: 'data/poc/probe12.png' }).catch(() => { });
await browser.close();
