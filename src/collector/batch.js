// Batch collection: supports persistent profiles or anonymous contexts,
// rebrowser-playwright CDP stealth, system Chrome, proxy rotation, and failure resilience.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { chromium } from 'rebrowser-playwright';
import { scrapePlaceReviews, consentCookies } from './place-reviews.js';
import { getProfileDir, hasSavedProfile, hasSystemChrome, parseProxy } from './browser.js';
import { pickFingerprint, webglOverrideScript } from './stealth.js';
import { withRetry } from '../core/retry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

let browserChecked = false;
export function ensureBrowserInstalled() {
  if (browserChecked) return;
  browserChecked = true;
  try {
    execSync('npx playwright install chromium 2>/dev/null', {
      stdio: 'pipe',
      timeout: 120_000,
    });
  } catch {
    // Already installed or network unavailable — proceed anyway
  }
}

export async function launchBatchCollector(urls, config = {}, onComplete = async () => ({}), onBatch = async () => ({})) {
  ensureBrowserInstalled();

  const summary = [];
  const concurrency = Math.min(Math.max(config.concurrency ?? 1, 1), 4);

  let profileDir = null;
  if (config.profile !== false) {
    if (typeof config.profile === 'string' && config.profile.length > 0) {
      profileDir = getProfileDir(PROJECT_ROOT, config.profile);
    } else if (hasSavedProfile(PROJECT_ROOT, 'default')) {
      profileDir = getProfileDir(PROJECT_ROOT, 'default');
    }
  }

  const channel = (config.chrome !== false && hasSystemChrome()) ? 'chrome' : undefined;
  const proxy = parseProxy(config.proxy);

  const commonArgs = [
    '--lang=en-US',
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--disable-dev-shm-usage',
  ];

  let browser = null;
  let sharedContext = null;

  if (profileDir) {
    console.log(`Using persistent profile (${channel ?? 'chromium'}): ${path.relative(PROJECT_ROOT, profileDir)}`);
    fs.mkdirSync(profileDir, { recursive: true });
    const initialFp = pickFingerprint();
    sharedContext = await chromium.launchPersistentContext(profileDir, {
      headless: config.headless === true, // F21: headed by default (headless triggers Google's limited view)
      channel,
      proxy,
      viewport: initialFp.viewport,
      locale: initialFp.locale,
      timezoneId: initialFp.timezoneId,
      userAgent: initialFp.userAgent,
      args: commonArgs,
    });
    await sharedContext.addInitScript(webglOverrideScript());
    await sharedContext.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      } catch {}
    });
  } else {
    browser = await chromium.launch({
      headless: config.headless === true, // F21: headed by default (headless triggers Google's limited view)
      channel,
      proxy,
      args: commonArgs,
    });
  }

  const queue = urls.slice();
  let i = 0;

  async function workOne() {
    while (queue.length) {
      if (config.abort?.aborted) break; // F4: stop taking new places after a shutdown signal
      const entry = queue.shift();
      // F3: entries may carry their original index (resume); plain strings use queue order.
      const listingUrl = typeof entry === 'string' ? entry : entry.url;
      const n = ++i;
      const itemIdx = typeof entry === 'string' ? n - 1 : entry.idx;
      const started = Date.now();
      const fp = pickFingerprint();

      let context = sharedContext;
      let ownContext = false;
      if (!context) {
        context = await browser.newContext({
          viewport: fp.viewport,
          locale: fp.locale,
          timezoneId: fp.timezoneId,
          userAgent: fp.userAgent,
          proxy,
        });
        await context.addCookies(consentCookies());
        await context.addInitScript(webglOverrideScript());
        await context.addInitScript(() => {
          try {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          } catch {}
        });
        ownContext = true;
      }

      const page = await context.newPage();
      try {
        console.log(`[${n}/${urls.length}] ${listingUrl}`);
        const result = await withRetry(
          async () => {
            return await scrapePlaceReviews(page, {
              url: listingUrl,
              sortMode: config.sort === 'default' ? undefined : config.sort,
              maxReviews: config.limit,
              language: { hl: config.language?.split('-')[0] ?? 'en', gl: 'us' },
              overrides: {
                headless: config.headless === true,
                shouldAbort: () => config.abort?.aborted === true,
                incremental: config.incremental,
                isPlaceCollected: config.isPlaceCollected,
              },
            }, (event, data) => {
              if (event === 'stream-batch' && onBatch) {
                onBatch(data, listingUrl, itemIdx).catch(() => {});
              }
            });
          },
          {
            maxAttempts: 3,
            baseDelayMs: 2000,
            onRetry: ({ attempt, delay, error }) => {
              console.log(`  Retry ${attempt}/3 after ${(delay / 1000).toFixed(1)}s (error: ${error.message || error})`);
            },
            retryableError: (err) => {
              const msg = String(err?.message || err);
              // Don't retry if user aborted or explicit sign-in wall
              if (/sign-in-wall|abort/i.test(msg)) return false;
              return true;
            },
          }
        );
        const done = await onComplete(result, listingUrl, itemIdx);
        summary.push({ ...done, durationMs: Date.now() - started });
        console.log(`  collected=${done.collected} termination=${result.termination.reason}`);
      } catch (err) {
        console.error(`  FAILED: ${err?.message ?? err}`);
        const failedItem = { listingUrl, error: String(err?.message ?? err), durationMs: Date.now() - started };
        await onComplete({ place: null, reviews: [], termination: { reason: 'failed', detail: String(err?.message ?? err) } }, listingUrl, itemIdx).catch(() => {});
        summary.push(failedItem);
      } finally {
        await page.close().catch(() => {});
        if (ownContext) {
          await context.close().catch(() => {});
        }
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: concurrency }, () => workOne()));
  } finally {
    const closeTimeout = setTimeout(() => {
      console.error('Browser close timed out — force killing');
      try {
        browser?.process?.()?.kill('SIGKILL');
      } catch {}
    }, 10_000);
    try {
      if (sharedContext) await sharedContext.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    } finally {
      clearTimeout(closeTimeout);
    }
  }
  return summary;
}
