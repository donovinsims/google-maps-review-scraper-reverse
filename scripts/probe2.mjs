// Probe #2: inspect the reviews panel DOM structure on a place page.
import { chromium } from 'playwright';

const url = process.argv[2];
const browser = await chromium.launch({ headless: true, args: ['--lang=en-US'] });
const context = await browser.newContext({
  viewport: { width: 1400, height: 960 }, locale: 'en-US', timezoneId: 'America/Los_Angeles',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(8000);

const out = await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('button[role="tab"]')].map((t) => t.getAttribute('aria-label'));
  const cards = document.querySelectorAll('div[data-review-id]');
  const more = [...document.querySelectorAll('button')].filter((b) => /more reviews/i.test(b.getAttribute('aria-label') ?? '')).map((b) => ({ cls: b.className, label: b.getAttribute('aria-label') }));
  const structure = {};
  for (const sel of ['[data-review-id]', '.jftiEf', '.wiI7pd', '.d4r55', '.xRkPPb', '.kvMYJc', '.fzvQIb', '.CDe7pd', '.NTyMbe', '.w8Iiyf']) {
    structure[sel] = document.querySelectorAll(sel).length;
  }
  // find candidate review containers by text "stars"/"helpful"
  const starEls = [...document.querySelectorAll('div,li')].filter((e) => /helpful|star/i.test(e.getAttribute?.('aria-label') ?? '')).slice(0, 6).map((e) => ({ tag: e.tagName, cls: e.className?.slice?.(0, 60), label: (e.getAttribute('aria-label') ?? '').slice(0, 60) }));
  let firstCardHtml = null;
  if (cards.length) firstCardHtml = cards[0].outerHTML.slice(0, 1500);
  else {
    // dump a snippet of whatever container surrounds "stars” text
    const anyStar = [...document.querySelectorAll('span')].find((s) => /\d+\s*star/i.test(s.getAttribute?.('aria-label') ?? ''));
    if (anyStar) firstCardHtml = anyStar.parentElement?.outerHTML?.slice?.(0, 1500) ?? null;
  }
  return { tabs, cardCount: cards.length, structure, more, starEls, firstCardHtml };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
