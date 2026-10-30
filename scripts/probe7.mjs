// Probe #7: which click style actually grows the reviews feed?
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
await page.waitForTimeout(2500);
const links = page.locator('a[href*="/maps/place/"]');
for (let i = 0; i < Math.min(await links.count(), 12); i++) {
  if (!(await links.nth(i).evaluate((a) => /sponsored/i.test((a.textContent ?? '').slice(0, 120))))) {
    await links.nth(i).click({ timeout: 20000 }); break;
  }
}
await page.waitForURL(/maps\/place\//, { timeout: 30000 });
await page.waitForSelector('div[data-review-id]', { timeout: 30000 });
await sleep(1000);
const countCards = () => page.evaluate(() => document.querySelectorAll('div[data-review-id]').length);
console.log('cards before:', await countCards());

const btn = page.locator(S.moreReviews).first();
console.log('btn count:', await btn.count());

// Style A: real click after scrollIntoView center
await btn.scrollIntoViewIfNeeded().catch(() => { });
await btn.click({ timeout: 4000 }).catch(() => console.log('A: visible click failed'));
await page.waitForTimeout(2500);
console.log('after A:', await countCards(), 'btn still?', await btn.count());

if (await countCards() === 6) {
  // Style B: dispatchEvent click
  await btn.dispatchEvent('click').catch((e) => console.log('B fail', String(e).slice(0, 80)));
  await page.waitForTimeout(2500);
  console.log('after B:', await countCards(), 'btn still?', await btn.count());
}
if (await countCards() === 6) {
  // Style C: element.click() inside page
  await btn.evaluate((el) => el.click()).catch((e) => console.log('C fail', String(e).slice(0, 80)));
  await page.waitForTimeout(2500);
  console.log('after C:', await countCards(), 'btn still?', await btn.count());
}
console.log('url tail:', page.url().slice(-70));
await page.screenshot({ path: 'data/poc/probe7.png' }).catch(() => { });
await browser.close();
