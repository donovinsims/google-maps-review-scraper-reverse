// Core Google Maps place-reviews extractor (independent implementation).
//
// MEASURED (2026-10-30, macOS Chromium, signed-out): the anonymous site shows a
// small preview feed (~6 cards / place) and redirects the "More reviews" action
// to accounts.google.com sign-in. We treat sign-in as a normal-local-user affordance:
// run `gmaps-reviews login` once to create a persistent profile owned by the user;
// the collector never sees or stores the password. Without it we collect the
// preview set only and label termination honestly (sign-in-required / preview).
//
// All page text and attributes are treated as untrusted data, never instructions.

import fs from 'node:fs';
import path from 'node:path';
import { prsToDate } from '../core/dates.js';
import { humanScroll, humanHover, randomDelay } from './human.js';
import { classifyPage } from '../core/health.js';

export const S = {
  container: 'div[data-review-id]',
  star: 'span.kvMYJc, span.fzvQIb',
  author: '.d4r55',
  text: '.wiI7pd',
  owner: '.CDe7pd',
  translatedBubble: '.NTyMbe',
  moreReviews: 'button[aria-label^="More reviews" i], button.more-reviews-button, button:has-text("More reviews")',
  moreText: 'button.w8nwRe[aria-label="See more" i], .w8Iiyf, button[aria-label="More"]',
  reviewsTab: 'button[role="tab"][aria-label*="review" i]',
  sortButton: 'button[aria-label*="Sort" i]',
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
const clean = (s) => (s == null ? null : (String(s).replace(/\s+/g, ' ').trim() || null));

/** Canonical input handling: {canonical} for place URLs, {shortLink} for share links. */
export function normalizePlaceUrl(raw, { hl = 'en', gl = 'us' } = {}) {
  let u;
  try { u = new URL(raw); } catch { throw new TypeError(`invalid URL: ${raw}`); }
  const host = u.hostname.toLowerCase();
  if (host.endsWith('maps.app.goo.gl')) return { shortLink: raw, canonical: null };
  if (host.endsWith('google.com') && /\/maps\/place\//.test(u.pathname)) {
    u.searchParams.set('hl', hl);
    u.searchParams.set('gl', gl);
    return { canonical: u.toString() };
  }
  // maps/search URLs are accepted: the collector resolves them to a place URL
  // by clicking past the result list. Share links map.app.goo.gl above.
  if (host.endsWith('google.com') && /\/maps\/search\//.test(u.pathname)) {
    u.searchParams.set('hl', hl);
    u.searchParams.set('gl', gl);
    return { searchUrl: u.toString(), canonical: null };
  }
  throw new TypeError(`not a recognized Google Maps place/search URL: ${raw}`);
}

/**
 * In-page card extraction. Pure function of the card element (Playwright
 * serializes this real function; runs in the page with sync DOM APIs).
 */
export function extractInPage(card) {
  const q = (sel) => card.querySelector(sel);
  const textOf = (el) => (el ? (String(el.textContent).replace(/\s+/g, ' ').trim() || null) : null);

  const starEl = q('span.kvMYJc, span.fzvQIb');
  const ratingRaw = starEl ? (starEl.getAttribute('aria-label') || textOf(starEl)) : null;
  let rating = null;
  if (ratingRaw) {
    const m = /([1-5](?:\.\d)?)\s*star/i.exec(ratingRaw) || /(\d)\s*\/\s*5/.exec(ratingRaw);
    rating = m ? Number(m[1]) : null;
  }

  const transEl = q('[data-is-english-language-translation]') || q('.NTyMbe');
  let translatedByGoogle = null;
  if (transEl) {
    translatedByGoogle = transEl.hasAttribute('data-is-english-language-translation')
      ? transEl.getAttribute('data-is-english-language-translation') === 'true'
      : true;
  }

  const dateRaw = textOf(q('span.rsqaWe'));

  const ownerEl = q('.CDe7pd');
  let ownerResponse = null;
  let ownerResponseDateRaw = null;
  if (ownerEl) {
    const od = q('span.DZSIDd') || q('.xRkPPb');
    ownerResponseDateRaw = od ? textOf(od) : null;
    const bodyEl = q('.CDe7pd .wiI7pd, .CDe7pd .MyEned');
    if (bodyEl) {
      ownerResponse = textOf(bodyEl);
    } else {
      let full = textOf(ownerEl) || '';
      full = full.replace(/^Response\s+from\s+the\s+owner\.?:?\s*/i, '');
      if (ownerResponseDateRaw && full.startsWith(ownerResponseDateRaw)) {
        full = full.slice(ownerResponseDateRaw.length);
      }
      ownerResponse = full.trim() || null;
    }
  }

  const profBtn = q('button[data-href*="contrib/"]');
  const profLink = q('a[href*="contrib/"]');

  return {
    reviewId: card.getAttribute('data-review-id'),
    originalLanguage: card.getAttribute('data-review-language'),
    reviewerName: textOf(q('.d4r55')),
    reviewerProfileUrl: profBtn ? profBtn.getAttribute('data-href') : (profLink ? profLink.getAttribute('href') : null),
    rating,
    ratingRaw,
    // F1: the owner reply body also uses .wiI7pd; never attribute it to the reviewer.
    reviewText: textOf([...card.querySelectorAll('.wiI7pd')].find((el) => !(el.closest && el.closest('.CDe7pd'))) ?? null),
    translatedByGoogle,
    publishedDateRaw: dateRaw,
    ownerResponse,
    ownerResponseDateRaw,
  };
}

export const DEFAULTS = {
  hl: 'en',
  gl: 'us',
  placeTimeoutMs: 300_000,
  networkTimeoutMs: 60_000,
  afterClickMs: 1200,
  afterClickGrowthMs: 12_000,
  scrollIdleMs: 1500,
  maxMoreClicks: 600,
  expandBatch: 80,
  maxDiagErrors: 40,
  feedRecoverMs: 10_000,
};

/** Cookies that suppress consent/promo chrome for anonymous visitors (public behavior, no auth). */
export function consentCookies() {
  const expires = Math.floor(Date.now() / 1000) + 180 * 86_400;
  return [
    { name: 'CONSENT', value: 'PENDING+987', domain: '.google.com', path: '/', expires },
    { name: 'SOCS', value: 'CAESEwgDEgk2ODE3MjYwMDgaAmVuIAEaBgiAoLCXBg', domain: '.google.com', path: '/', expires },
  ];
}

async function pickPlaceRating(page) {
  try {
    const text = await page.locator('div.F7nice span[aria-hidden="true"], span.fontDisplayLarge').first().textContent({ timeout: 2000 });
    const num = parseFloat(text?.trim()?.replace(',', '.'));
    if (!isNaN(num) && num >= 1 && num <= 5) return num;
  } catch {}
  try {
    const aria = await page.locator('span.ceNzKf, div.F7nice span[aria-label*="star" i]').first().getAttribute('aria-label', { timeout: 2000 });
    const m = /([1-5](?:[.,]\d)?)\s*star/i.exec(aria ?? '');
    if (m) return parseFloat(m[1].replace(',', '.'));
  } catch {}
  return null;
}

/**
 * Collect reviews for one place.
 * @param {import('playwright').Page} page
 * @param {{url: string, sortMode?: 'newest'|'highest'|'lowest'|'default',
 *          maxReviews?: number, language?: {hl:string,gl:string}, overrides?: object}} input
 * @param {(event: string, data?: object) => void} [onProgress]
 */
export async function scrapePlaceReviews(page, input, onProgress = () => {}) {
  const cfg = { ...DEFAULTS, ...(input.overrides ?? {}), ...(input.language ?? {}) };
  const startedAt = Date.now();
  const seen = new Set();
  const collected = [];
  const diag = { moreClicks: 0, expandClicks: 0, consentScreens: 0, staleElements: 0, pageErrors: [] };
  const place = { name: null, placeId: null, rating: null, reviewsCount: null, url: null };
  let termination = { reason: 'not-terminated' };
  let duplicates = 0;

  const norm = normalizePlaceUrl(input.url, cfg);
  const gotoUrl = norm.canonical ?? norm.searchUrl ?? norm.shortLink;
  const alreadyHere = /maps\/place|maps\/search/.test(page.url());
  if (!alreadyHere) {
    await page.goto(gotoUrl, { waitUntil: 'domcontentloaded', timeout: cfg.networkTimeoutMs });
  }

  if (norm.searchUrl) {
    // Wait for the results list to actually render before clicking through.
    await page.waitForSelector('a[href*="/maps/place/"], div[data-review-id]', { timeout: 30_000 }).catch(() => { });
    const resolved = await resolvePlaceFromSearch(page).catch(() => false);
    if (!resolved && !/\/maps\/place\//.test(page.url())) {
      termination = { reason: 'search-mismatch', detail: `could not match query to a business listing: ${norm.searchUrl}` };
    }
  }

  if (norm.shortLink) {
    await page.waitForURL(/maps\/place|maps\/search/, { timeout: 30_000 }).catch(() => { });
  }

  const finalUrl = page.url();
  if (/\/sorry\/|unusual traffic|recaptcha/i.test(finalUrl)) {
    termination = { reason: 'blocked', detail: `challenge wall observed: ${finalUrl}` };
  }

  // Sign-in wall anywhere in this session must be classified, never bypassed.
  const signinHit = async () => /accounts\.google\.[a-z.]+\/(v3\/|signin|ServiceLogin)/i.test(page.url());

  if (termination.reason === 'not-terminated' && /maps\/place|maps\/search/.test(finalUrl)) {
    place.url = finalUrl.split('?')[0] + `?hl=${cfg.hl}&gl=${cfg.gl}`;

    const panelAppeared = await page
      .waitForSelector(`${S.reviewsTab}, ${S.container}`, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);

    place.name = await pickPlaceName(page);
    place.rating = await pickPlaceRating(page);

    // Review count: Reviews tab label; fallback to the More-reviews button label.
    const tabLabel = panelAppeared
      ? await page.locator(S.reviewsTab).first().getAttribute('aria-label').catch(() => null)
      : null;
    const mc = /(\d[\d.,]*)\s*(?:R|r)eview/.exec(tabLabel ?? '');
    place.reviewsCount = mc ? Number(mc[1].replace(/[.,\s]/g, '')) : null;
    if (place.reviewsCount === null) {
      const moreLabel = await page.locator(S.moreReviews).first().getAttribute('aria-label').catch(() => null);
      const mm = /More reviews \(([\d,.]+)\)/.exec(moreLabel ?? '');
      if (mm) place.reviewsCount = Number(mm[1].replace(/[,.]/g, ''));
    }

    // Stable place key from the !1s URI fragment (survives re-collections).
    const dec = safeDecode(finalUrl);
    place.placeId = /!1s([A-Za-z0-9%]+:0x[0-9a-f]+)/i.exec(dec)?.[1]
      ?? /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(finalUrl)?.[1]
      ?? /!1s([A-Za-z0-9:_-]+)/.exec(dec)?.[1]
      ?? /(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(finalUrl)?.[1]
      ?? null;

    // F21: Google's "limited view" (seen headless, and signed-out) hides the Reviews tab.
    // Detect it up front and label it, instead of reporting structure-unknown.
    if (await isLimitedViewWithoutReviews(page)) {
      termination = {
        reason: 'limited-view',
        detail: `Google Maps served a limited view with no Reviews tab (headless=${cfg.headless === true}). Run headed with a signed-in profile.`,
      };
    } else if (!place.placeId) {
      termination = {
        reason: 'missing-place-id',
        detail: `unable to resolve stable place ID from URL: ${finalUrl}`,
      };
    } else if (cfg.incremental && cfg.isPlaceCollected?.(place.placeId)) {
      termination = {
        reason: 'skipped-incremental',
        detail: `business ${place.placeId} already collected recently`,
      };
    }

    if (termination.reason === 'not-terminated') {
      if (place.reviewsCount) {
        const opened = await ensureFeed(page);
        if (!opened && !panelAppeared) { /* classification below */ }
      } else if (!panelAppeared && (await page.locator(S.container).count()) === 0) {
        const body = clean((await page.locator('body').innerText().catch(() => ''))?.slice(0, 500));
        termination = {
          reason: /no review/i.test(body ?? '') ? 'no-reviews' : 'structure-unknown',
          detail: body?.slice(0, 160),
        };
      }
    }

    // Sort via the public sort button when requested (requires the full tabs view);
    // for the signed-in full view Google rewrites the URL segment.
    if (termination.reason === 'not-terminated' && input.sortMode && input.sortMode !== 'default') {
      const sb = page.locator(S.sortButton).first();
      const firstIdBefore = await page.locator(S.container).first().getAttribute('data-review-id', { timeout: 2000 }).catch(() => null);
      let sortOk = false;
      try {
        await sb.click({ timeout: 10_000 });
        await sleep(500);
        const opt = page.locator('[role="menuitemradio"]').filter({ hasText: sortPattern(input.sortMode) }).first();
        await opt.click({ timeout: 10_000 });
        sortOk = true;
      } catch {
        onProgress('sort-missing', { mode: input.sortMode });
      }
      if (!sortOk) {
        termination = { reason: 'sort-unavailable', detail: `could not apply sort "${input.sortMode}" (button or menu option not found)` };
      } else {
        // F24: wait for the feed to re-render in the new order (first card changes or cards reappear).
        const rerendered = await page.waitForFunction((before) => {
          const c = document.querySelector('div[data-review-id]');
          return !!c && c.getAttribute('data-review-id') !== before;
        }, firstIdBefore, { timeout: cfg.sortRenderMs ?? 15_000 }).then(() => true).catch(() => false);
        if (!rerendered) onProgress('sort-rerender-timeout', { mode: input.sortMode });
        await sleep(cfg.afterClickMs);
      }
      if (termination.reason === 'not-terminated' && await signinHit()) termination = { reason: 'sign-in-required', detail: 'sort view redirected to Google sign-in' };
    }
  }

  const deadline = startedAt + placeTimeoutMs(cfg);
  let surfaceStalls = 0;
  let loadRetries = 0;
  while (termination.reason === 'not-terminated' && Date.now() < deadline) {
    if (cfg.shouldAbort?.()) {
      termination = { reason: 'interrupted', detail: 'shutdown signal received; collected data so far is persisted' };
      break;
    }
    if (await signinHit()) {
      termination = {
        reason: 'sign-in-required',
        detail: 'anonymous feeds are capped by Google; sign in a local profile with `gmaps-reviews login` to collect more',
      };
      break;
    }
    // Feed re-renders transiently clear cards; always sample a settled list.
    if ((await page.locator(S.container).count()) === 0) {
      // F24: Google clears the feed transiently while loading/re-rendering.
      // Wait, nudge the scroller, wait again, then try the full ensureFeed before giving up.
      const appeared = await recoverFeed(page, cfg, diag);
      if (!appeared) {
        termination = { reason: collected.length ? 'pagination-stall' : 'structure-unknown', detail: 'review feed failed to (re)render' };
        break;
      }
    }

    // Expand truncated review bodies ("See more") before reading text.
    const mores = page.locator(S.moreText);
    const nExpand = Math.min(await mores.count(), cfg.expandBatch);
    for (let i = 0; i < nExpand; i++) {
      try { await mores.nth(i).click({ timeout: 1500 }); diag.expandClicks++; await sleep(60); }
      catch { diag.staleElements++; }
    }

    let fresh = 0;
    const batchRecs = [];
    const cards = page.locator(S.container);
    const cCount = await cards.count();
    for (let i = 0; i < cCount; i++) {
      let card;
      try { card = await cards.nth(i).elementHandle({ timeout: 3000 }); } catch { diag.staleElements++; continue; }
      if (!card) { diag.staleElements++; continue; }
      try {
        const raw = await card.evaluate(extractInPage);
        const rec = finalizeRecord(raw, cfg, place);
        if (!rec) continue;
        if (seen.has(rec.reviewId)) { duplicates++; continue; }
        seen.add(rec.reviewId);
        collected.push(rec);
        batchRecs.push(rec);
        fresh++;
      } catch (err) {
        diag.staleElements++;
        if (diag.pageErrors.length < cfg.maxDiagErrors) diag.pageErrors.push(String(err).slice(0, 300));
      }
    }
    if (batchRecs.length > 0) {
      onProgress('stream-batch', { place, reviews: batchRecs });
    }
    onProgress('page-batch', { fresh, total: collected.length, duplicates });

    if (input.maxReviews && collected.length >= input.maxReviews) {
      collected.length = input.maxReviews; // Truncate strictly to requested limit
      termination = { reason: 'limit-reached', detail: `maxReviews=${input.maxReviews}` };
      break;
    }

    // Dismiss any blocking promo modal if present
    try {
      const promo = page.locator('div[role="dialog"]').filter({ hasText: /Sign-in to get the best/i }).first();
      if ((await promo.count()) > 0) {
        await promo.getByRole('button', { name: 'Dismiss', exact: true }).first().click({ timeout: 2000 }).catch(() => {});
        diag.consentScreens++;
        await sleep(400);
      }
    } catch { /* not fatal */ }

    // Check if Google is enforcing anonymous limited view
    const isLimitedView = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return text.includes("You're seeing a limited view of Google Maps");
    });

    if (isLimitedView && fresh === 0 && collected.length > 0) {
      termination = {
        reason: 'anonymous-preview-limit',
        detail: `Reached Google Maps anonymous preview limit (${collected.length} reviews). Run \`gmr login\` with a persistent profile to extract full review history.`,
      };
      break;
    }

    // Target the review scroll container directly
    await page.evaluate(() => {
      const card = document.querySelector('div[data-review-id]');
      if (!card) return;
      const scroller = card.closest('div.m6QErb.DxyBCb') || card.closest('div[role="feed"]') || card.parentElement?.parentElement;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });

    // Also scroll last card into view and trigger wheel interaction
    if (cCount > 0) {
      const lastCard = cards.last();
      await lastCard.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      await lastCard.hover({ timeout: 1500 }).catch(() => {});
      await page.mouse.wheel(0, 3000).catch(() => {});
    }

    // Adaptive idle: faster when reviews are loading, slower when approaching stall
    const adaptiveIdle = fresh > 5 ? cfg.scrollIdleMs * 0.6
      : fresh > 0 ? cfg.scrollIdleMs
      : cfg.scrollIdleMs * 1.5;
    await sleep(adaptiveIdle + Math.floor(Math.random() * 600));

    // Mid-scrape block and captcha detection
    const currentUrl = page.url();
    const pageClass = classifyPage(currentUrl);
    if (pageClass === 'blocked' || pageClass === 'captcha') {
      termination = { reason: 'blocked', detail: `mid-scrape ${pageClass} at ${currentUrl}` };
      break;
    }

    if (fresh > 0) {
      surfaceStalls = 0;
    } else {
      surfaceStalls++;
      // Stall recovery: re-engage the feed on consecutive stall
      if (surfaceStalls === 2) {
        const tab = page.locator(S.reviewsTab).first();
        if ((await tab.count()) > 0) {
          await tab.click({ timeout: 4000 }).catch(() => {});
          await sleep(1500);
        }
      }
      // Attempt to click "See more reviews" button if present at bottom
      const seeMoreBtn = page.getByRole('button', { name: /see more reviews/i }).or(page.locator('button:has-text("See more reviews")')).first();
      if ((await seeMoreBtn.count()) > 0) {
        diag.moreClicks++;
        await seeMoreBtn.click({ timeout: 4000 }).catch(() => {});
        await sleep(1500);
      }
      if (surfaceStalls >= 3) {
        if (isLimitedView) {
          termination = {
            reason: 'anonymous-preview-limit',
            detail: `Reached Google Maps anonymous preview limit (${collected.length} reviews). Run \`gmr login\` with a persistent profile to extract full review history.`,
          };
        } else {
          termination = {
            reason: collected.length ? 'no-more-reviews' : 'no-reviews-found',
            detail: 'no further loading observed after consecutive scroll passes',
          };
        }
        break;
      }
    }
  }
  if (termination.reason === 'not-terminated') {
    termination = { reason: collected.length ? 'timeout' : 'no-reviews-found', detail: 'placeTimeoutMs exceeded' };
  }

  await page.close().catch(() => { });
  const totalSeen = collected.length + duplicates;
  return {
    place,
    reviews: collected,
    termination: {
      ...termination,
      collectedCount: collected.length,
      duplicates,
      duplicateRate: totalSeen ? Number((duplicates / totalSeen).toFixed(3)) : 0,
      durationMs: Date.now() - startedAt,
    },
    diagnostics: diag,
  };
}

function placeTimeoutMs(cfg) { return cfg.placeTimeoutMs ?? DEFAULTS.placeTimeoutMs; }

/** From a maps/search listing, click the result that best matches the search query
 *  (sponsored ads rank out unless their headline matches the query). */
async function resolvePlaceFromSearch(page) {
  const q = (/\/maps\/search\/([^/@?]+)/.exec(safeDecode(page.url()))?.[1] ?? '').replace(/\+/g, ' ');
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;

  const info = await page.evaluate(({ sel }) =>
    [...document.querySelectorAll(sel)].slice(0, 25).map((a, idx) => {
      const card = a.closest('div[role="feed"], div[data-result-rank], div') ?? a.parentElement;
      const head = (card?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const sponsoredAria = !!a.closest('[aria-label*="Sponsored" i]')
        || !!card?.querySelector('[aria-label*="Sponsored" i]');
      return { idx, head, sponsoredAria };
    }), { sel: 'a[href*="/maps/place/"]' });

  // Rank: query token match on the headline (most matching tokens = best), ads penalized.
  let bestIdx = -1;
  let bestScore = 0; // Must be strictly positive
  for (const { idx, head, sponsoredAria } of info) {
    const h = head.toLowerCase().replace(/^sponsored\s*/i, '');
    let matched = 0;
    for (const tok of tokens) {
      if (h.includes(tok)) matched++;
    }
    let score = matched;
    if (h.startsWith(tokens[0])) score += 1;
    if (sponsoredAria) score -= 50;
    if (score > bestScore) { bestScore = score; bestIdx = idx; }
  }

  // Require matching at least 1 token (or half the tokens for long queries)
  const minRequired = Math.max(1, Math.floor(tokens.length * 0.4));
  if (bestIdx === -1 || bestScore < minRequired) return false;

  const best = info[bestIdx];
  if (!best) return false;
  const link = page.locator('a[href*="/maps/place/"]').nth(best.idx);
  try { await link.click({ timeout: 10_000 }); } catch { return false; }
  await page.waitForURL(/\/maps\/place\//, { timeout: 30_000 }).catch(() => { });
  return /\/maps\/place\//.test(page.url());
}

function sortPattern(mode) {
  const map = { newest: /newest/i, highest: /highest/i, lowest: /lowest/i, 'most relevant': /relevant/i };
  return map[mode] ?? /newest/i;
}

function safeDecode(u) {
  try { return decodeURIComponent(u); } catch { return u; }
}

/** Business name: prefer an h1 matching the URL slug; skip Results/Sponsored h1s. */
async function pickPlaceName(page) {
  const slug = (/\/maps\/place\/([^/@?]+)/.exec(safeDecode(page.url()))?.[1] ?? '').replace(/\+/g, ' ');
  let best = null;
  const h1s = page.locator('h1');
  const n = Math.min(await h1s.count(), 15);
  for (let i = 0; i < n; i++) {
    const t = clean(await h1s.nth(i).textContent().catch(() => null));
    if (!t || /^(Results|Sponsored)$/i.test(t)) continue;
    best = best ?? t;
    if (slug && t.toLowerCase() === slug.toLowerCase()) { best = t; break; }
  }
  return best;
}

/**
 * Render a reviews feed. Strategies: already-mounted cards (typical), Reviews
 * tab click (transient clear), then panel scroll. quick=true only checks
 * currently-mounted cards. Dismisses the transient "Sign-in to get the best"
 * promo if it is covering the page (public UI dismiss affordance).
 */
async function ensureFeed(page, { quick = false } = {}) {
  const mounted = async () => (await page.locator(S.container).count()) > 0;
  if (await mounted()) return true;
  if (quick) return false;

  // Promo dismiss (if present) — it covers the panel and swallows clicks.
  try {
    const promo = page.locator('div[role="dialog"]').filter({ hasText: 'Sign-in to get the best of Google Maps' }).first();
    if ((await promo.count()) > 0) {
      await promo.getByText('Dismiss', { exact: true }).first().click({ timeout: 3000 }).catch(() => { });
      await sleep(600);
    }
  } catch { /* not fatal */ }
  if (await mounted()) return true;

  const tab = page.locator(S.reviewsTab).first();
  if ((await tab.count()) > 0) {
    try {
      await tab.click({ timeout: 15_000 });
      if (await page.waitForSelector(S.container, { timeout: 8_000 }).then(() => true).catch(() => false)) return true;
    } catch { /* fall through */ }
  }
  try {
    await page.evaluate(() => {
      const scrollers = [...document.querySelectorAll('div,section')].filter(
        (d) => d.scrollHeight > d.clientHeight + 200 && d.clientHeight > 300,
      );
      for (const s of scrollers.slice(0, 5)) s.scrollTop = 600;
    });
    if (await page.waitForSelector(S.container, { timeout: 10_000 }).then(() => true).catch(() => false)) return true;
  } catch { /* fall through */ }
  return await mounted();
}

/** F21: limited view banner present, no Reviews tab, and no review cards mounted. */
export async function isLimitedViewWithoutReviews(page) {
  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (!/You.re seeing a limited view of Google Maps/i.test(text)) return false;
  const reviewsTab = await page.locator('button[role="tab"]').filter({ hasText: /^\s*Reviews\s*$/i }).count();
  const cards = await page.locator(S.container).count();
  return reviewsTab === 0 && cards === 0;
}

/** F24: recover from a transiently empty feed instead of terminating on one sample. */
async function recoverFeed(page, cfg, diag) {
  const waitCards = (ms) => page.waitForSelector(S.container, { timeout: ms }).then(() => true).catch(() => false);
  const ms = cfg.feedRecoverMs ?? DEFAULTS.feedRecoverMs;
  if (await waitCards(ms)) { diag.feedRecoveries = (diag.feedRecoveries ?? 0) + 1; return true; }
  await page.mouse.wheel(0, -400).catch(() => {});
  await page.mouse.wheel(0, 800).catch(() => {});
  if (await waitCards(ms)) { diag.feedRecoveries = (diag.feedRecoveries ?? 0) + 1; return true; }
  const ok = await ensureFeed(page);
  if (ok) diag.feedRecoveries = (diag.feedRecoveries ?? 0) + 1;
  return ok;
}

/** Dates may render as "Edited 3 months ago"; raw stays verbatim, parsing ignores the prefix. */
function stripEdited(s) {
  return s ? String(s).replace(/^edited\s+/i, '') : s;
}

/** Turn the raw in-page record into the canonical schema (dates parsed, nulls preserved). */
function finalizeRecord(raw, cfg, place) {
  if (!raw?.reviewId) return null;
  const when = prsToDate(stripEdited(raw.publishedDateRaw), Date.now(), null);
  const respWhen = prsToDate(stripEdited(raw.ownerResponseDateRaw), Date.now(), null);
  const reviewUrl = place.placeId
    ? `https://www.google.com/maps/place/?data=!1s${encodeURIComponent(place.placeId)}!8s${encodeURIComponent(String(raw.reviewId))}&hl=${cfg.hl}&gl=${cfg.gl}`
    : null;
  return {
    reviewId: String(raw.reviewId),
    reviewerName: raw.reviewerName ?? null,
    reviewerProfileUrl: raw.reviewerProfileUrl ?? null,
    rating: raw.rating ?? null,
    ratingRaw: raw.ratingRaw ?? null,
    reviewText: raw.reviewText ?? null,
    originalLanguage: raw.originalLanguage ?? null,
    translatedByGoogle: raw.translatedByGoogle ?? null,
    publishedDateRaw: raw.publishedDateRaw ?? null,
    publishedDateParsed: when?.iso ?? null,
    datePrecision: when?.precision ?? null,
    ownerResponse: raw.ownerResponse ?? null,
    ownerResponseDateRaw: raw.ownerResponseDateRaw ?? null,
    ownerResponseDateParsed: respWhen?.iso ?? null,
    ownerResponseDatePrecision: respWhen?.precision ?? null,
    reviewUrl: reviewUrl ?? null,
    collectedAt: new Date().toISOString(),
  };
}
