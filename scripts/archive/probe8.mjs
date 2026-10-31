// Probe #8: dismiss the sign-in promo, then attempt every pagination lever.
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

const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true }).first();
console.log('dismiss btn present:', await dismiss.count());
if (await dismiss.count() > 0) {
  await dismiss.click({ timeout: 5000 }).catch((e) => console.log('dismiss fail', String(e).slice(0, 80)));
  await sleep(1000);
}
const countCards = () => page.evaluate(() => document.querySelectorAll('div[data-review-id]').length);
console.log('cards after dismiss:', await countCards());

// limited view expander?
const seeMoreLimited = page.getByText("You're seeing a limited view of Google Maps").count();
console.log('limited-view notice:', seeMoreLimited);

const btn = page.locator(S.moreReviews).first();
if (await btn.count()) {
  await btn.scrollIntoViewIfNeeded().catch(() => { });
  await btn.click({ timeout: 5000 }).catch(() => console.log('A fail'));
  await page.waitForTimeout(2500);
  console.log('cards after More-click:', await countCards(), '| more btn count:', await btn.count());
}
// scroll probe inside side panel
await page.evaluate(() => {
  const scrollers = [...document.querySelectorAll('div')].filter((d) => d.scrollHeight > d.clientHeight + 200 && d.clientHeight > 300);
  for (const s of scrollers.slice(0, 6)) s.scrollTop = s.scrollHeight;
});
await sleep(2000);
console.log('cards after panel-scroll:', await countCards(), '| more btn:', await btn.count());
await page.screenshot({ path: 'data/poc/probe8.png' }).catch(() => { });
await browser.close();
