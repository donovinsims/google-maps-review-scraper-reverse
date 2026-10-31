// Probe: what distinguishes a Sponsored result card in the maps/search DOM?
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--lang=en-US'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 960 }, locale: 'en-US', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36' });
const page = await ctx.newPage();
await page.goto('https://www.google.com/maps/search/Tartine+Bakery+San+Francisco/?hl=en&gl=us', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
const info = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a[href*="/maps/place/"]')].slice(0, 8);
  return links.map((a, idx) => {
    const card = a.closest('div[data-value], div[jsaction], div[role="button"], div[aria-label]') ?? a.parentElement?.parentElement;
    // find any descendant ancestor text mentioning sponsored
    let sponsored = false;
    let inner = card;
    for (let up = 0; up < 5 && inner; up++) {
      const t = inner.getAttribute && inner.getAttribute('aria-label');
      if (t && /sponsored/i.test(t)) { sponsored = true; break; }
      if (inner.querySelector?.('[aria-label*="Sponsored" i]')) { sponsored = true; break; }
      if ((inner.textContent ?? '').slice(0, 400).toLowerCase().includes('sponsored')) { sponsored = true; break; }
      inner = inner.parentElement;
    }
    const head = (card?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return { idx, href: (a.getAttribute('href') ?? '').slice(0, 40), sponsored, head };
  });
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
