// Probe #4: locate the current date/owner-response subclasses inside a review card.
import { chromium } from 'playwright';

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
const n = await links.count();
for (let i = 0; i < n; i++) {
  const sponsor = await links.nth(i).evaluate((a) => !!a.closest('[data-bg="3"]') || /sponsored/i.test(a.parentElement?.textContent?.slice(0, 200) ?? ''));
  if (!sponsor) { await links.nth(i).click({ timeout: 20000 }); break; }
}
await page.waitForURL(/maps\/place\//, { timeout: 30_000 });
await page.waitForSelector('[data-review-id] div.jftiEf', { timeout: 40_000 }).catch(() => { });

const out = await page.evaluate(() => {
  const card = document.querySelector('div.jftiEf[data-review-id]');
  if (!card) return { err: 'no card' };
  const hits = [];
  card.querySelectorAll('div,span,button,a').forEach((el) => {
    const t = (el.textContent ?? '').trim();
    if (!t || t.length > 80) return;
    if (/\b(ago|years?|months?|weeks?|days?|hours?|minutes?)\b/i.test(t) || /^(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(t)) {
      hits.push({ tag: el.tagName, cls: el.className, text: t.slice(0, 50), parentCls: el.parentElement?.className?.slice?.(0, 40) });
    }
  });
  const moreBtn = [...card.querySelectorAll('button')].filter((b) => /more/i.test((b.getAttribute('aria-label') ?? '') + b.textContent)).map((b) => ({ cls: b.className, aria: b.getAttribute('aria-label'), txt: b.textContent.slice(0, 20), expanded: b.getAttribute('aria-expanded') }));
  return { hits: hits.slice(0, 12), moreBtn, cardFullLen: card.outerHTML.length };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
