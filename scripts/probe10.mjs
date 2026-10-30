// Probe #10: expand past the "limited view" gate and see what becomes clickable.
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
await page.waitForTimeout(1200);

// find clickable "See more" that belongs to the limited-view notice
const limited = page.locator('text=limited view of Google Maps').first();
const parent = limited.locator('..').locator('..');
const seeMore = parent.getByText('See more', { exact: false }).first();
console.log('seeMore in limited notice?', await seeMore.count());
await seeMore.click({ timeout: 5000 }).catch((e) => console.log('click fail', String(e).slice(0, 100)));
await sleep(2500);

const state = await page.evaluate(() => ({
  url: location.href.slice(-90),
  divRevId: document.querySelectorAll('div[data-review-id]').length,
  moreBtnLabel: [...document.querySelectorAll('button')].filter((b) => /more reviews/i.test(b.getAttribute('aria-label') ?? '')).map((b) => b.getAttribute('aria-label')),
  dialogs: document.querySelectorAll('div[role="dialog"]').length,
}));
console.log(JSON.stringify(state, null, 2));

const btn = page.locator(S.moreReviews).first();
if (await btn.count()) {
  console.log('clicking More reviews…');
  await btn.scrollIntoViewIfNeeded().catch(() => { });
  await btn.click({ timeout: 5000 }).catch(() => console.log('more fail'));
  await sleep(2500);
  console.log('cards now:', await page.evaluate(() => document.querySelectorAll('div[data-review-id]').length));
  await sleep(0);
  const second = await page.locator(S.moreReviews).first().getAttribute('aria-label').catch(() => null);
  console.log('more label now:', second);
}
await page.screenshot({ path: 'data/poc/probe10.png' }).catch(() => { });
await browser.close();
