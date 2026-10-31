// Probe #9: structure of the sign-in promo + limited-view widgets.
import { chromium } from 'playwright';

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
await page.waitForTimeout(1500);

const out = await page.evaluate(() => {
  const hits = [];
  document.querySelectorAll('button, a, div[role="button"], span').forEach((el) => {
    const t = (el.textContent ?? '').trim();
    if (/dismiss|limited view|sign in/i.test(t) && t.length < 80) {
      hits.push({ tag: el.tagName, role: el.getAttribute('role'), aria: el.getAttribute('aria-label'), text: t.slice(0, 60), cls: String(el.className).slice(0, 50) });
    }
  });
  return hits.slice(0, 25);
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
