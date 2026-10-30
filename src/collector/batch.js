// Batch collection: one shared browser (headless, anonymous profile by default),
// one page per place, stopping cleanly on classification/validation.
import fs from 'node:fs';
import { chromium } from 'playwright';
import path from 'node:path';
import { scrapePlaceReviews, consentCookies } from './place-reviews.js';

export async function launchBatchCollector(urls, config = {}, onComplete = async () => ({})) {
  const summary = [];
  const concurrency = Math.min(Math.max(config.concurrency ?? 1, 1), 4); // conservative default
  const browser = await chromium.launch({
    headless: config.headless !== false,
    args: ['--lang=en-US', '--disable-blink-features=AutomationControlled', '--no-first-run', '--disable-dev-shm-usage'],
  });
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
  const queue = urls.slice();
  let i = 0;

  async function workOne() {
    while (queue.length) {
      const listingUrl = queue.shift();
      const n = ++i;
      const started = Date.now();
      const context = await browser.newContext({
        viewport: { width: 1400, height: 960 },
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        userAgent: ua,
      });
      await context.addCookies(consentCookies());
      const page = await context.newPage();
      try {
        console.log(`[${n}/${urls.length}] ${listingUrl}`);
        const result = await scrapePlaceReviews(page, {
          url: listingUrl,
          sortMode: config.sort === 'default' ? undefined : config.sort,
          maxReviews: config.limit,
          language: { hl: config.language?.split('-')[0] ?? 'en', gl: 'us' },
        });
        const done = await onComplete(result, listingUrl);
        summary.push({ ...done, durationMs: Date.now() - started });
        console.log(`  collected=${done.collected} termination=${result.termination.reason}`);
      } catch (err) {
        console.error(`  FAILED: ${err?.message ?? err}`);
        summary.push({ listingUrl, error: String(err?.message ?? err), durationMs: Date.now() - started });
      } finally {
        await context.close().catch(() => { });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => workOne()));
  await browser.close().catch(() => { });
  return summary;
}
