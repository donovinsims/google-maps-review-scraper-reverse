// Phase 3 proof of concept: extract reviews for ONE business from the command line.
// Usage: node scripts/poc.mjs "<place URL or search URL or share link>" [maxReviews]
// Writes data/poc/<slug>.json with the collected records + run metadata.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { scrapePlaceReviews } from '../src/collector/place-reviews.js';

const url = process.argv[2];
const maxReviews = process.argv[3] ? Number(process.argv[3]) : undefined;
if (!url) {
  console.error('usage: node scripts/poc.mjs "<google maps place or search url>" [maxReviews]');
  process.exit(1);
}

const launchArgs = [
  '--lang=en-US',
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--disable-dev-shm-usage',
];
const browser = await chromium.launch({ headless: true, args: launchArgs });
try {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 960 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    // Cosmetic UA hygiene only (drop the HeadlessChrome token); no bot-control bypass.
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });

  let targetUrl;
  // Search URL convenience: click through to the first result, then hand its URL to the collector.
  if (/maps\/search/.test(url)) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const consentReject = page.getByRole('button', { name: /reject all/i }).first();
    if ((await consentReject.count()) > 0) {
      await consentReject.click().catch(() => { });
      await page.waitForTimeout(1500);
    }
    const first = page.locator('a[href*="/maps/place/"]').first();
    await first.click({ timeout: 30_000 });
    await page.waitForURL(/maps\/place\//, { timeout: 30_000 });
    // Wait for the place panel (Reviews tab or review cards) before snapshotting URL.
    await page.waitForSelector('button[role="tab"][aria-label*="review" i], div[data-review-id]', { timeout: 30_000 }).catch(() => { });
    targetUrl = page.url();
    console.log('resolved place URL:', targetUrl);
  }
  // The place page is already loaded in this same tab when we came from search.
  const fromSearch = /maps\/place/.test(page.url());
  if (!fromSearch) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  }

  const started = Date.now();
  const result = await scrapePlaceReviews(page, targetUrl.includes('/maps/search') ? { url: url } : { url: targetUrl, maxReviews }, (ev, d) => {
    if (ev === 'page-batch') console.log(`[batch] +${d.fresh} unique (total ${d.total}, dupes ${d.duplicates})`);
    else if (ev === 'debug' && process.env.GMR_DEBUG) console.log('[debug]', JSON.stringify(d));
    else if (ev === 'consent') console.log('[consent] handled consent screen');
    else console.log(`[${ev}]`, d ?? '');
  });

  const slug = (result.place.name ?? 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'unknown';
  const outDir = new URL('../data/poc/', import.meta.url);
  await mkdir(outDir, { recursive: true });
  const outPath = new URL(`${slug || 'unknown'}-${Date.now()}.json`, outDir);
  await writeFile(outPath, JSON.stringify({ ranAt: new Date().toISOString(), input: { url, maxReviews }, ...result }, null, 2));
  console.log('---');
  console.log('place:', result.place);
  console.log('termination:', result.termination);
  console.log('diagnostics:', result.diagnostics);
  console.log('sample:', result.reviews[0], '…', result.reviews[1]);
  console.log('saved:', outPath.pathname, `(${Date.now() - started} ms total)`);
} finally {
  await browser.close();
}
