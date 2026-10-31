import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBatchCollector } from '../../src/collector/batch.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Minimal Playwright fake that records every call.
function fakePw() {
  const log = { launch: [], persistent: [], contexts: 0, pages: [], closedPages: 0, closedContexts: 0, browserClosed: 0 };
  const mkPage = () => { const p = { id: log.pages.length, closed: false, close: async () => { p.closed = true; log.closedPages++; } }; log.pages.push(p); return p; };
  const mkCtx = () => ({ addCookies: async () => {}, addInitScript: async () => {}, newPage: async () => mkPage(), close: async () => { log.closedContexts++; } });
  return {
    log,
    chromium: {
      launch: async (o) => { log.launch.push(o); return { newContext: async () => { log.contexts++; return mkCtx(); }, close: async () => { log.browserClosed++; } }; },
      launchPersistentContext: async (dir, o) => { log.persistent.push({ dir, o }); return mkCtx(); },
    },
  };
}
const ok = (extra = {}) => ({ place: { placeId: 'p' }, reviews: [{ reviewId: 'r' }], termination: { reason: 'limit-reached' }, ...extra });
const quiet = async (fn) => { const l = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.error = e; } };

test('batch: anonymous launch is headed by default, leaves signals to the runner, one context per place, everything closed', async () => {
  const f = fakePw(); const done = [];
  await quiet(() => launchBatchCollector(['u0', 'u1'], { profile: false, deps: { chromium: f.chromium, scrape: async () => ok() } },
    async (res, url, idx) => { done.push([url, idx, res.termination.reason]); return { collected: 1 }; }));
  assert.equal(f.log.launch.length, 1);
  assert.equal(f.log.launch[0].headless, false);
  assert.equal(f.log.launch[0].handleSIGINT, false);
  assert.equal(f.log.launch[0].handleSIGTERM, false);
  assert.equal(f.log.contexts, 2);
  assert.equal(f.log.closedContexts, 2);
  assert.equal(f.log.closedPages, f.log.pages.length);
  assert.equal(f.log.browserClosed, 1);
  assert.deepEqual(done, [['u0', 0, 'limit-reached'], ['u1', 1, 'limit-reached']]);
});

test('batch: headless only when explicitly requested', async () => {
  const f = fakePw();
  await quiet(() => launchBatchCollector(['u0'], { profile: false, headless: true, deps: { chromium: f.chromium, scrape: async (_p, o) => { assert.equal(o.overrides.headless, true); return ok(); } } }, async () => ({})));
  assert.equal(f.log.launch[0].headless, true);
});

test('batch: named profile uses a persistent context with signal handling off', async () => {
  const f = fakePw(); const name = 'mock-test-profile';
  try {
    await quiet(() => launchBatchCollector(['u0'], { profile: name, deps: { chromium: f.chromium, scrape: async () => ok() } }, async () => ({})));
    assert.equal(f.log.persistent.length, 1);
    assert.equal(f.log.persistent[0].dir, path.join(ROOT, 'data', 'profiles', name));
    assert.equal(f.log.persistent[0].o.headless, false);
    assert.equal(f.log.persistent[0].o.handleSIGINT, false);
    assert.equal(f.log.launch.length, 0);
  } finally { fs.rmSync(path.join(ROOT, 'data', 'profiles', name), { recursive: true, force: true }); }
});

test('batch: a retry gets a fresh page and the old page is closed (F5)', async () => {
  const f = fakePw(); let calls = 0; const pagesSeen = [];
  await quiet(() => launchBatchCollector(['u0'], { profile: false, deps: { chromium: f.chromium, retryBaseDelayMs: 1,
    scrape: async (page) => { pagesSeen.push(page); if (++calls === 1) throw new Error('net::ERR_TIMED_OUT'); return ok(); } } }, async () => ({})));
  assert.equal(calls, 2);
  assert.notEqual(pagesSeen[0], pagesSeen[1]);
  assert.equal(pagesSeen[0].closed, true);
  assert.equal(pagesSeen[1].closed, true);
});

test('batch: exhausted retries report failed with the error, never done', async () => {
  const f = fakePw(); let calls = 0; const got = [];
  const summary = await quiet(() => launchBatchCollector(['u0'], { profile: false, deps: { chromium: f.chromium, retryBaseDelayMs: 1,
    scrape: async () => { calls++; throw new Error('boom'); } } }, async (res) => { got.push(res.termination); return {}; }));
  assert.equal(calls, 3);
  assert.equal(got[0].reason, 'failed');
  assert.match(got[0].detail, /boom/);
  assert.match(summary[0].error, /boom/);
});

test('batch: no retry after shutdown, and no new places are started (F4)', async () => {
  const f = fakePw(); const abort = { aborted: false }; let calls = 0; const got = [];
  await quiet(() => launchBatchCollector(['u0', 'u1'], { profile: false, abort, deps: { chromium: f.chromium, retryBaseDelayMs: 1,
    scrape: async () => { calls++; abort.aborted = true; throw new Error('Target page, context or browser has been closed'); } } },
    async (res, url) => { got.push(url); return {}; }));
  assert.equal(calls, 1);
  assert.deepEqual(got, ['u0']);
});

test('batch: sign-in wall is not retried', async () => {
  const f = fakePw(); let calls = 0;
  await quiet(() => launchBatchCollector(['u0'], { profile: false, deps: { chromium: f.chromium, retryBaseDelayMs: 1,
    scrape: async () => { calls++; throw new Error('sign-in-wall'); } } }, async () => ({})));
  assert.equal(calls, 1);
});

test('batch: stream batches reach onBatch with the original index; a failing onBatch does not crash the batch', async () => {
  const f = fakePw(); const seen = [];
  await quiet(() => launchBatchCollector([{ url: 'u7', idx: 7 }], { profile: false, deps: { chromium: f.chromium,
    scrape: async (_p, _o, onProgress) => { onProgress('stream-batch', { reviews: [1] }); onProgress('page-batch', {}); return ok(); } } },
    async (res, url, idx) => { seen.push(['done', idx]); return {}; },
    async (data, url, idx) => { seen.push(['batch', url, idx]); throw new Error('db locked'); }));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(seen, [['batch', 'u7', 7], ['done', 7]]);
});

test('batch: concurrency is clamped to 1..4 and all places complete', async () => {
  const f = fakePw(); let live = 0, peak = 0; const urls = Array.from({ length: 8 }, (_, i) => 'u' + i);
  await quiet(() => launchBatchCollector(urls, { profile: false, concurrency: 10, deps: { chromium: f.chromium,
    scrape: async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; return ok(); } } }, async () => ({})));
  assert.equal(peak, 4);
  assert.equal(f.log.contexts, 8);
});

test('F11: stealth is off by default: no spoofed UA/timezone, no init scripts, no AutomationControlled flag', async () => {
  const f = fakePw(); let scripts = 0; const ctxOpts = [];
  const orig = f.chromium.launch;
  f.chromium.launch = async (o) => { const b = await orig(o); const nc = b.newContext; b.newContext = async (co) => { ctxOpts.push(co); const c = await nc(co); c.addInitScript = async () => { scripts++; }; return c; }; return b; };
  await quiet(() => launchBatchCollector(['u0'], { profile: false, deps: { chromium: f.chromium, scrape: async () => ok() } }, async () => ({})));
  assert.ok(!f.log.launch[0].args.includes('--disable-blink-features=AutomationControlled'));
  assert.equal(ctxOpts[0].userAgent, undefined);
  assert.equal(ctxOpts[0].timezoneId, undefined);
  assert.equal(scripts, 0);
});

test('F11: --stealth opts in to the anti-detection layer', async () => {
  const f = fakePw(); let scripts = 0; const ctxOpts = [];
  const orig = f.chromium.launch;
  f.chromium.launch = async (o) => { const b = await orig(o); const nc = b.newContext; b.newContext = async (co) => { ctxOpts.push(co); const c = await nc(co); c.addInitScript = async () => { scripts++; }; return c; }; return b; };
  await quiet(() => launchBatchCollector(['u0'], { profile: false, stealth: true, deps: { chromium: f.chromium, scrape: async () => ok() } }, async () => ({})));
  assert.ok(f.log.launch[0].args.includes('--disable-blink-features=AutomationControlled'));
  assert.equal(typeof ctxOpts[0].userAgent, 'string');
  assert.equal(scripts, 2);
});
