// Diagnose the batch path stage by stage (mirrors collector/batch.js flow).
import { chromium } from 'playwright';
import { normalizePlaceUrl } from '../src/collector/place-reviews.js';

const url = process.argv[2] ?? 'https://www.google.com/maps/search/Tartine+Bakery+San+Francisco/?hl=en&gl=us';
const browser = await chromium.launch({ headless: true, args: ['--lang=en-US', '--disable-blink-features=AutomationControlled', '--no-first-run'] });
const context = await browser.newContext({
  viewport: { width: 1400, height: 960 },
  locale: 'en-US',
  timezoneId: 'America/Los_Angeles',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
});
const expires = Math.floor(Date.now() / 1000) + 180 * 86400;
await context.addCookies([
  { name: 'CONSENT', value: 'PENDING+987', domain: '.google.com', path: '/', expires },
  { name: 'SOCS', value: 'CAESEwgDEgk2ODE3MjYwMDgaAmVuIAEaBgiAoLCXBg', domain: '.google.com', path: '/', expires },
]);
const page = await context.newPage();

const norm = normalizePlaceUrl(url, {});
console.log('stage0 norm:', JSON.stringify(norm).slice(0, 120));
await page.goto(norm.searchUrl ?? norm.canonical ?? norm.shortLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);
console.log('stage1 url:', page.url());
const h1a = await page.locator('h1').first().textContent().catch(() => null);
console.log('stage1 h1:', h1a);
const cards = await page.locator('div[data-review-id]').count();
console.log('stage1 review-cards:', cards);
const placeLinks = await page.locator('a[href*="/maps/place/"]').count();
console.log('stage1 place-links:', placeLinks);

if (!/\/maps\/place\//.test(page.url()) && placeLinks > 0) {
  for (let i = 0; i < Math.min(placeLinks, 5); i++) {
    const link = page.locator('a[href*="/maps/place/"]').nth(i);
    const txt = (await link.textContent().catch(() => '') ?? '').trim().slice(0, 40);
    console.log(`stage2 link[${i}]: ${txt}`);
    await link.click({ timeout: 10000 });
    await page.waitForURL(/\/maps\/place\//, { timeout: 30000 }).catch(() => { });
    if (/\/maps\/place\//.test(page.url())) { console.log('stage2 resolved:', page.url().slice(0, 90)); break; }
  }
}
await page.waitForTimeout(6000);
console.log('stage3 url:', page.url());
console.log('stage3 review-cards:', await page.locator('div[data-review-id]').count());
console.log('stage3 reviews-tab count:', await page.locator('button[role="tab"][aria-label*="review" i]').count());
console.log('stage3 h1:', await page.locator('h1').first().textContent().catch(() => null));
await page.screenshot({ path: 'data/poc/probe-batch.png' });
await browser.close();
