# Hardening work log

Paused by owner on 2026-10-30 at a verified checkpoint; see `../HANDOFF.md` to resume.

- Baseline: Node v26.7.0, `npm test`: 44 passed, 0 failed/skipped.
- Foundation milestone: 49 passed.
- Runner/storage/export/browser milestone: 78 passed.
- Collector-loop/dashboard/signal milestone: 94 passed.
- Final checkpoint: `npm run check` exit 0, 100 passed, 0 failed/skipped; 23 source files syntax checked.
- Phases 0–5 have substantial implementation and offline coverage, with review gaps listed in HANDOFF.md. Phase 6 harnesses are present but live tools need validation. Phase 7 documentation and all ten live gates are unfinished.
- Live investigations exposed a false search-footer end marker; failing tests reproduced it and passed after correction. Later real anonymous runs found zero review cards and now report non-success.
- Production login session closed cleanly at pause; its final auth probe was anonymous. No signed-in collection verified.
- No commits, pushes, or deployments. Keep current changes intact.

Approved ruling: intersect date windows and recompute midpoint; midpoint movement is not itself drift.

- Resumed checkpoint (2026-10-31):
  - Fixed `batch.js` worker joining: workers join and settle via `Promise.allSettled`; unexpected rejections rethrow after all workers complete.
  - Fixed anonymous limited-view classification in `place-reviews.js`: when anonymous and place panel resolved, stalling with 0 cards yields `anonymous-preview-limit` (exit 2) rather than generic `structure-unknown`. Updated anonymous warning text.
  - Fixed `doctor.js`: separately records `Browser executable` and `Signed in` checks on launch failure.
  - Added `tests/core/doctor.test.js` covering success and launch failure separation.
  - Added regressions to `tests/core/batch.test.js`: persistent context rebuild on closed-target error; worker joining on unexpected rejection.
  - Added regression to `tests/integration/collector-loop.test.js`: anonymous limited-view with zero cards classifies as `anonymous-preview-limit`.
  - Extended `scripts/check.mjs` to syntax check `scripts/*.mjs`.
  - Rewrote `README.md` and `REQUIREMENTS.md` with accurate options, schema v2, exit codes, and honest grading.
  - Updated `VALIDATION.md` with current state: `npm run check` exit 0, **106 passed, 0 failed/skipped**, **26 source/script files** syntax checked.
  - Fixed Google Maps login URL in `browser.js`: Google retired `?service=maps` (HTTP 400); updated to `https://accounts.google.com/ServiceLogin?continue=https%3A%2F%2Fwww.google.com%2Fmaps...` (HTTP 302/200). Added regression in `tests/core/browser.test.js`.

- Live verification (2026-10-31, 03:44–04:05 UTC):
  - Selector regression fixed in `src/collector/selectors.js` + `tests/integration/scraper.test.js`: review-count chip buttons (aria-label `… mentioned in N reviews`) matched the More-reviews disclosure selector, polluting `expected` (a live run recorded 0/38 against 4,499 real reviews). `moreReviews` now excludes `aria-label*="mentioned in"` (and German `erwähnt`).
  - Scroll-retry added to the sort card-load guard in `src/collector/place-reviews.js`: some places (Tartine Manufactory) mount the first review cards only after the feed scrolls, so the guard scrolls and re-waits up to 3 times before honest termination instead of failing immediately.
  - Result: `npm run check` exit 0, **111 passed, 0 failed/skipped**.

- Live verification summary:
  - Signed-in `--sort newest` runs collected 10 reviews each, newest-descending, for Tartine Bakery (**10/242**, `limit-reached`, job `job-652a35ea`, previously `sort-failed`) and Tartine Manufactory (**10/4499**, `limit-reached`, job `job-67c7f198`, previously `sort-failed` then `structure-unknown` before the guards). DB files: `data/validation/live-fix.db`, `data/validation/live-manufactory.db`.
  - Both verification milestones from the resume plan now hold on live URLs: no `sort-failed`, and honest termination when cards never mount. DB review order descending "2 days ago"→"2 weeks ago"; the 4 rating-only reviews per place are stored with `reviewText=null` exactly as designed.

- Pre-existing limitation confirmed in this session — **open item, not a fix regression**:
  - Slug-only `/maps/place/Name` URLs without a feature ID still yield `missing-place-id` (blank pane until JS opens tabs). Use the settled place URL with a feature ID or search URL form instead.
  - Signed-in `/maps/search/…` pages render zero `/maps/place/` anchor links (they auto-redirect to `/maps/place/…`), so `resolveSearch`'s anchor-based match fails with `search-mismatch`. A settled probe confirmed the redirect. `resolveSearch` needs a URL- or history-based fallback before search URLs resolve reliably while signed in.
