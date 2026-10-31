// Probe #6: run IN_PAGE_EXTRACT verbatim on live cards, print what it returns.
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
await page.waitForTimeout(2000);
const links = page.locator('a[href*="/maps/place/"]');
for (let i = 0; i < Math.min(await links.count(), 12); i++) {
  if (!(await links.nth(i).evaluate((a) => /sponsored/i.test((a.textContent ?? '').slice(0, 120))))) {
    await links.nth(i).click({ timeout: 20000 }); break;
  }
}
await page.waitForURL(/maps\/place\//, { timeout: 30000 });
await page.waitForSelector('div[data-review-id]', { timeout: 30000 });
await sleep(1500);
const tab = page.locator('button[role="tab"][aria-label*="review" i]').first();
await tab.click({ timeout: 15000 }).catch(() => console.log('no tab click'));
await page.waitForSelector('div[data-review-id]', { timeout: 20000 }).catch(() => console.log('no cards after tab'));
await sleep(800);

const cards = page.locator('div[data-review-id]');
const n = await cards.count();
console.log('n cards:', n, '; first-text of .wiI7pd:', await page.locator('.wiI7pd').first().textContent().catch(() => null));

for (let i = 0; i < Math.min(n, 3); i++) {
  const handle = await cards.nth(i).elementHandle({ timeout: 3000 });
  try {
    const attrs = await handle.evaluate((el) => ({ tag: el.tagName, revId: el.getAttribute('data-review-id'), cls: el.className }));
    console.log(`card[${i}] attrs:`, JSON.stringify(attrs).slice(0, 200));
    const raw = await handle.evaluate(`(card) => {
      const q = (sel) => card.querySelector(sel);
      const st = q('span.kvMYJc');
      return { hasStar: !!st, starLabel: st ? st.getAttribute('aria-label') : null, author: q('.d4r55') ? q('.d4r55').textContent : null, dateEl: q('span.rsqaWe') ? 1 : 0 };
    }`);
    console.log(`card[${i}] quick:`, JSON.stringify(raw));
  } catch (e) {
    console.log(`card[${i}] ERR`, String(e).slice(0, 200));
  }
}
await browser.close();
