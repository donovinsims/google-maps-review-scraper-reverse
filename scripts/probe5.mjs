// Probe #5: replicate the POC steps with instrumentation after each stage.
import { chromium } from 'playwright';
import { sleep } from '../src/collector/util.js';

const searchUrl = process.argv[2];
const browser = await chromium.launch({ headless: true, args: ['--lang=en-US'] });
const context = await browser.newContext({
  viewport: { width: 1400, height: 960 }, locale: 'en-US', timezoneId: 'America/Los_Angeles',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

const snap = async (label) => {
  const s = await page.evaluate(() => ({
    url: location.href.slice(-60),
    div_revId: document.querySelectorAll('div[data-review-id]').length,
    any_revId: document.querySelectorAll('[data-review-id]').length,
    jftiEf: document.querySelectorAll('.jftiEf').length,
    tabs: [...document.querySelectorAll('button[role="tab"]')].map((t) => t.getAttribute('aria-label')).slice(0, 6),
    moreBtns: [...document.querySelectorAll('button')].filter((b) => /More reviews/i.test(b.getAttribute('aria-label') ?? '')).length,
  }));
  console.log(label, JSON.stringify(s));
};

await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await snap('0:search');
await page.waitForTimeout(2500);
const links = page.locator('a[href*="/maps/place/"]');
const n = Math.min(await links.count(), 12);
let clicked = false;
for (let i = 0; i < n; i++) {
  const sponsored = await links.nth(i).evaluate((a) => /sponsored/i.test((a.closest('div[role="feed"], div')?.textContent ?? '').slice(0, 120)));
  if (!sponsored) { await links.nth(i).click({ timeout: 20000 }); clicked = true; break; }
}
if (!clicked) await links.first().click();
await page.waitForURL(/maps\/place\//, { timeout: 30000 });
await page.waitForSelector('button[role="tab"][aria-label*="review" i], [data-review-id]', { timeout: 30000 }).catch(() => { });
await snap('1:panel');
await page.waitForTimeout(2000);

const tab = page.locator('button[role="tab"][aria-label*="review" i]').first();
if (await tab.count() > 0) {
  await tab.click({ timeout: 15000 }).catch((e) => console.log('tab click failed', String(e).slice(0, 120)));
  await snap('2:tab-clicked');
  await sleep(1500);
  await snap('3:after-tab-wait');
}

const mb = page.locator('button[aria-label^="More reviews" i]').last();
if (await mb.count() > 0) {
  await mb.scrollIntoViewIfNeeded({ timeout: 5000 }).catch((e) => console.log('scroll fail', String(e).slice(0, 80)));
  await mb.click({ timeout: 12000, force: true }).catch((e) => console.log('more fail', String(e).slice(0, 80)));
  await sleep(2000);
  await snap('4:after-more');
}

await browser.close();
