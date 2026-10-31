// Probe #3: click through from search (like the working POC), then dump the reviews panel DOM.
import { chromium } from 'playwright';

const searchUrl = process.argv[2];
const browser = await chromium.launch({ headless: true, args: ['--lang=en-US'] });
const context = await browser.newContext({
  viewport: { width: 1400, height: 960 }, locale: 'en-US', timezoneId: 'America/Los_Angeles',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(2000);
const first = page.locator('a[href*="/maps/place/"]').first();
await first.click({ timeout: 30_000 });
await page.waitForURL(/maps\/place\//, { timeout: 30_000 });
await page.waitForSelector('div[data-review-id], button[aria-label*="More reviews" i]', { timeout: 40_000 }).catch(() => { });
await page.waitForTimeout(3000);

const out = await page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  let firstCard = null;
  const cards = document.querySelectorAll('[data-review-id]');
  if (cards.length) firstCard = cards[0].outerHTML.slice(0, 2500);
  return {
    placeUrl: location.href.slice(0, 200),
    h1s: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()).slice(0, 5),
    tabs: [...document.querySelectorAll('button[role="tab"]')].map((t) => t.getAttribute('aria-label')).slice(0, 10),
    counts: {
      '[data-review-id]': q('[data-review-id]'),
      'div[data-review-id]': q('div[data-review-id]'),
      '.wiI7pd': q('.wiI7pd'), '.d4r55': q('.d4r55'), '.xRkPPb': q('.xRkPPb'),
      '.kvMYJc': q('.kvMYJc'), '.fzvQIb': q('.fzvQIb'), '.CDe7pd': q('.CDe7pd'), '.NTyMbe': q('.NTyMbe'),
      'moreBtns': [...document.querySelectorAll('button')].filter((b) => /more reviews/i.test(b.getAttribute('aria-label') ?? '')).length,
    },
    kindless: cards.length && cards[0].tagName,
    firstCard,
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
