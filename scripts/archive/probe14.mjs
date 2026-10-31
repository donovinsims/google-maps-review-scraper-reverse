// Probe #14: headed Chromium + consent cookies => does More reviews paginate?
import { chromium } from 'playwright';
import { S } from '../src/collector/place-reviews.js';
import { sleep } from '../src/collector/util.js';

const searchUrl = process.argv[2];
const browser = await chromium.launch({ headless: false, args: ['--lang=en-US', '--window-size=1400,960'] });
const context = await browser.newContext({
  viewport: { width: 1400, height: 960 }, locale: 'en-US', timezoneId: 'America/Los_Angeles',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
});
const in180d = Math.floor(Date.now() / 1000) + 180 * 86400;
await context.addCookies([
  { name: 'CONSENT', value: 'PENDING+987', domain: '.google.com', path: '/', expires: in180d },
  { name: 'SOCS', value: 'CAESEwgDEgk2ODE3MjYwMDgaAmVuIAEaBgiAoLCXBg', domain: '.google.com', path: '/', expires: in180d },
]);
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
await page.waitForSelector('div[data-review-id]', { timeout: 30000 });
await page.waitForTimeout(1000);

const countCards = () => page.evaluate(() => document.querySelectorAll('div[data-review-id]').length);
console.log('cards:', await countCards());
const promoCnt = await page.evaluate(() => [...document.querySelectorAll('div[role="dialog"]')].filter((d) => /Sign-in to get the best/.test(d.textContent ?? '')).length);
console.log('promo dialogs:', promoCnt);

const btn = page.locator(S.moreReviews).last();
await btn.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => { });
const clicked = await btn.click({ timeout: 8000 }).then(() => true).catch((e) => { console.log('click err', String(e).slice(0, 90)); return false; });
console.log('clicked:', clicked);
const grew = await page.waitForFunction((prev) => document.querySelectorAll('div[data-review-id]').length > prev, 6, { timeout: 15000, polling: 250 }).then(() => true).catch(() => false);
console.log('grew:', grew, 'cards now:', await countCards(), 'more label:', await btn.getAttribute('aria-label').catch(() => null));
await page.screenshot({ path: 'data/poc/probe14.png' }).catch(() => { });
await browser.close();
