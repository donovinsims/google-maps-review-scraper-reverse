// Diagnostic probe: what does a direct place-URL load render in headless Chromium?
import { chromium } from 'playwright';

const url = process.argv[2];
const browser = await chromium.launch({ headless: true, args: ['--lang=en-US', '--disable-blink-features=AutomationControlled'] });
const context = await browser.newContext({ viewport: { width: 1400, height: 960 }, locale: 'en-US', timezoneId: 'America/Los_Angeles' });
const page = await context.newPage();
await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(9000);
const urlNow = page.url();
const info = await page.evaluate(() => ({
  title: document.title,
  h1s: [...document.querySelectorAll('h1,h2')].map((e) => e.textContent.trim()).slice(0, 8),
  tabs: [...document.querySelectorAll('button[role="tab"]')].map((e) => e.getAttribute('aria-label')).slice(0, 12),
  reviewCards: document.querySelectorAll('div[data-review-id]').length,
  docLen: document.body.innerHTML.length,
  headlessProbe: { ua: navigator.userAgent, webdriver: navigator.webdriver },
  bodySample: document.body.innerText.slice(0, 600),
}));
console.log(JSON.stringify({ urlNow, ...info }, null, 2));
await browser.close();
