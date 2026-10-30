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

import { prsToDate } from '../core/dates.js';

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
    reviewText: textOf(q('.wiI7pd')),
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
};

/** Cookies that suppress consent/promo chrome for anonymous visitors (public behavior, no auth). */
export function consentCookies() {
  const expires = Math.floor(Date.now() / 1000) + 180 * 86_400;
  return [
    { name: 'CONSENT', value: 'PENDING+987', domain: '.google.com', path: '/', expires },
    { name: 'SOCS', value: 'CAESEwgDEgk2ODE3MjYwMDgaAmVuIAEaBgiAoLCXBg', domain: '.google.com', path: '/', expires },
  ];
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
    await resolvePlaceFromSearch(page).catch(() => { });
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
      ?? null;

    if (place.reviewsCount) {
      const opened = await ensureFeed(page);
      if (!opened && !panelAppeared) { /* classification below */ }
    } else if (!panelAppeared && (await page.locator(S.container).count()) === 0) {
      const body = clean((await page.locator('body').textContent())?.slice(0, 500));
      termination = {
        reason: /no review/i.test(body ?? '') ? 'no-reviews' : 'structure-unknown',
        detail: body?.slice(0, 160),
      };
    }

    // Sort via the public sort button when requested (requires the full tabs view);
    // for the signed-in full view Google rewrites the URL segment.
    if (termination.reason === 'not-terminated' && input.sortMode && input.sortMode !== 'default') {
      const sb = page.locator(S.sortButton).first();
      try { await sb.click({ timeout: 10_000 }); await sleep(500); } catch { onProgress('sort-failed', { mode: input.sortMode }); }
      const opt = page.locator('[role="menuitemradio"]').filter({ hasText: sortPattern(input.sortMode) }).first();
      await opt.click({ timeout: 10_000 }).catch(() => onProgress('sort-missing', { mode: input.sortMode }));
      await sleep(1200);
      if (await signinHit()) termination = { reason: 'sign-in-required', detail: 'sort view redirected to Google sign-in' };
    }
  }

  const deadline = startedAt + placeTimeoutMs(cfg);
  let surfaceStalls = 0;
  let loadRetries = 0;
  while (termination.reason === 'not-terminated' && Date.now() < deadline) {
    if (await signinHit()) {
      termination = {
        reason: 'sign-in-required',
        detail: 'anonymous feeds are capped by Google; sign in a local profile with `gmaps-reviews login` to collect more',
      };
      break;
    }
    // Feed re-renders transiently clear cards; always sample a settled list.
    if ((await page.locator(S.container).count()) === 0) {
      const appeared = await ensureFeed(page, { quick: true });
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
        fresh++;
      } catch (err) {
        diag.staleElements++;
        if (diag.pageErrors.length < cfg.maxDiagErrors) diag.pageErrors.push(String(err).slice(0, 300));
      }
    }
    onProgress('page-batch', { fresh, total: collected.length, duplicates });

    if (input.maxReviews && collected.length >= input.maxReviews) {
      termination = { reason: 'limit-reached', detail: `maxReviews=${input.maxReviews}` };
      break;
    }

    const moreBtn = page.locator(S.moreReviews).last();
    if ((await moreBtn.count()) > 0) {
      diag.moreClicks++;
      if (diag.moreClicks > cfg.maxMoreClicks) {
        termination = { reason: 'pagination-cap', detail: `maxMoreClicks=${cfg.maxMoreClicks}` };
        break;
      }
      try {
        await moreBtn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => { });
        await moreBtn.click({ timeout: 10_000 }).catch(() => moreBtn.click({ timeout: 10_000, force: true }));
        const grew = await page
          .waitForFunction(
            (prev) => document.querySelectorAll('div[data-review-id]').length > prev,
            cCount,
            { timeout: cfg.afterClickGrowthMs, polling: 250 },
          )
          .then(() => true)
          .catch(() => false);
        await sleep(cfg.afterClickMs);
        if (await signinHit()) {
          termination = { reason: 'sign-in-required', detail: 'More-reviews redirected to Google sign-in' };
          break;
        }
        if (!grew) {
          loadRetries++;
          onProgress('load-retry', { retries: loadRetries });
          if (loadRetries >= 3) {
            termination = { reason: 'pagination-stall', detail: 'More-reviews click produced no growth 3x' };
            break;
          }
        } else loadRetries = 0;
      } catch (err) {
        if (diag.pageErrors.length < cfg.maxDiagErrors) diag.pageErrors.push(String(err).slice(0, 300));
        if (/timeout/i.test(String(err))) {
          termination = { reason: collected.length ? 'pagination-stall' : 'no-reviews-found', detail: 'More-reviews click timed out' };
          break;
        }
      }
      continue;
    }

    // No More button: lazy-load scroll probe.
    const before = collected.length;
    await page.keyboard.press('End');
    await sleep(cfg.scrollIdleMs);
    if ((await page.locator(S.container).count()) <= cCount && collected.length === before) {
      surfaceStalls++;
      if (surfaceStalls >= 2) {
        termination = { reason: 'no-more-reviews', detail: 'no further loading observed after scroll passes' };
        break;
      }
    } else surfaceStalls = 0;
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

/** From a maps/search listing, click the first organic result (skip Sponsored ads). */
async function resolvePlaceFromSearch(page) {
  const links = page.locator('a[href*="/maps/place/"]');
  const n = Math.min(await links.count(), 20);
  for (let i = 0; i < n; i++) {
    const link = links.nth(i);
    let href = '';
    try { href = await link.getAttribute('href', { timeout: 5000 }); } catch { continue; }
    if (!href || /^(Sponsored|Ad)$/i.test((await link.textContent().catch(() => ''))?.trim() ?? '')) continue;
    // Organic results carry a reviews block; check the card label if titled.
    try {
      await link.click({ timeout: 10_000 });
    } catch { continue; }
    await page.waitForURL(/\/maps\/place\//, { timeout: 30_000 }).catch(() => { });
    if (/\/maps\/place\//.test(page.url())) return true;
  }
  return false;
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
    ? `https://www.google.com/maps/place/?hl=${cfg.hl}&gl=${cfg.gl}!1s${encodeURIComponent(place.placeId)}!8s${encodeURIComponent(String(raw.reviewId))}`
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
