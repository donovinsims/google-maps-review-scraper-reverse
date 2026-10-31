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

/** Retry policy. Never retry after a shutdown request, an abort, or a sign-in wall. */
export function isRetryable(err, abort) {
  if (abort?.aborted === true) return false;
  const msg = String(err?.message || err);
  return !/sign-in-wall|abort/i.test(msg);
}

export async function launchBatchCollector(urls, config = {}, onComplete = async () => ({}), onBatch = async () => ({})) {
  // Test seam: config.deps can supply chromium / scrape / retryBaseDelayMs (no browser needed).
  const deps = config.deps ?? {};
  const pw = deps.chromium ?? chromium;
  const scrape = deps.scrape ?? scrapePlaceReviews;
  if (!config.deps) ensureBrowserInstalled();

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

  const channel = (config.chrome !== false && !config.deps && hasSystemChrome()) ? 'chrome' : undefined;
  const proxy = parseProxy(config.proxy);

  // F11: the anti-detection layer (UA/timezone/viewport spoofing, WebGL and navigator.webdriver
  // overrides, AutomationControlled flag) is opt-in only. Default runs the real browser honestly.
  const stealth = config.stealth === true;
  const commonArgs = [
    '--lang=en-US',
    ...(stealth ? ['--disable-blink-features=AutomationControlled'] : []),
    '--no-first-run',
    '--disable-dev-shm-usage',
  ];
  const HONEST = { viewport: { width: 1280, height: 900 }, locale: 'en-US' };
  const fpOptions = (fp) => (stealth
    ? { viewport: fp.viewport, locale: fp.locale, timezoneId: fp.timezoneId, userAgent: fp.userAgent }
    : { ...HONEST });
  const applyStealthScripts = async (ctx) => {
    if (!stealth) return;
    await ctx.addInitScript(webglOverrideScript());
    await ctx.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      } catch {}
    });
  };

  let browser = null;
  let sharedContext = null;

  if (profileDir) {
    console.log(`Using persistent profile (${channel ?? 'chromium'}): ${path.relative(PROJECT_ROOT, profileDir)}`);
    fs.mkdirSync(profileDir, { recursive: true });
    const initialFp = pickFingerprint();
    sharedContext = await pw.launchPersistentContext(profileDir, {
      headless: config.headless === true, // F21: headed by default (headless triggers Google's limited view)
      // F4: let the runner own SIGINT/SIGTERM; Playwright's default handler kills the browser mid-batch.
      handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
      channel,
      proxy,
      ...fpOptions(initialFp),
      args: commonArgs,
    });
    await applyStealthScripts(sharedContext);
  } else {
    browser = await pw.launch({
      headless: config.headless === true, // F21: headed by default (headless triggers Google's limited view)
      // F4: let the runner own SIGINT/SIGTERM; Playwright's default handler kills the browser mid-batch.
      handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
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
        context = await browser.newContext({ ...fpOptions(fp), proxy });
        await context.addCookies(consentCookies());
        await applyStealthScripts(context);
        ownContext = true;
      }

      // F5: each retry attempt gets a fresh page so no DOM or scroll state carries over.
      let page = null;
      try {
        console.log(`[${n}/${urls.length}] ${listingUrl}`);
        const result = await withRetry(
          async () => {
            if (page) await page.close().catch(() => {});
            page = await context.newPage();
            return await scrape(page, {
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
                onBatch(data, listingUrl, itemIdx).catch((e) => console.error(`  onBatch error: ${e?.message ?? e}`));
              }
            });
          },
          {
            maxAttempts: 3,
            baseDelayMs: deps.retryBaseDelayMs ?? 2000,
            onRetry: ({ attempt, delay, error }) => {
              console.log(`  Retry ${attempt}/3 after ${(delay / 1000).toFixed(1)}s (error: ${error.message || error})`);
            },
            retryableError: (err) => isRetryable(err, config.abort),
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
        if (page) await page.close().catch(() => {});
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
