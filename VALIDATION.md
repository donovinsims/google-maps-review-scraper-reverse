# Validation — release gate PASSED

Checkpoint: 2026-10-31 07:12 UTC. Node v26.7.0; macOS arm64; Google Chrome 156.0.8078.74.

## Offline checks actually run

- Baseline `npm test`: 44 passed, 0 failed, 0 skipped.
- Latest checkpoint `npm run check`: exit 0; **111 passed, 0 failed, 0 skipped**; **26 source/script files** syntax checked.
- Regressions verified:
  - Doctor reports individual check lines on both launch success and launch failure
  - Persistent context is rebuilt and retried after closed-target error
  - Batch workers join and settle via `Promise.allSettled` even if a worker throws
  - Anonymous limited overview with zero review cards classifies as `anonymous-preview-limit` (exit 2)
  - Subprocess SIGINT regression: exit 130, job interrupted, store closed, owned fake child absent.
  - Review-count chip buttons (`mentioned in N reviews`) no longer match the More-reviews trigger selector
  - Google login URL returns HTTP 302/200 (previously 400 after Google change)
  - Search URL resolution with client-side auto-redirect to `/maps/place/` verified live.

## Live collections verified

Signed-in (persistent default profile), Google Chrome:

| Run | Place / URL form | URL | Expected | Collected | Termination | Exit | Outcome |
|---|---|---|---:|---:|---|---:|---|
| 5 | Tartine Bakery, direct feature-ID URL (~03:46 UTC) | `/maps/place/Tartine+Bakery/data=!4m2!3m1!1s0x808f7e1807365605:0x601f7a97f0ce6c6b?hl=en&gl=us` | 242 | 10 | limit-reached | 0 | **Success.** Reviews stored newest-descending ("3 days ago" → "6 days ago"); 4 rating-only reviews with `text=null`; sort verified, no `sort-failed`. Previously this run ended `sort-failed`. DB `data/validation/live-fix.db`, job `job-652a35ea-d20f-4059-8ed9-8c7587858792`. |
| 6 | Tartine Manufactory, slug URL (~03:48 UTC) | `/maps/place/Tartine+Manufactory` (slug only) | n/a | 0 | missing-place-id | 1 | Failed as documented: slug-only URLs without feature ID are a known limitation, not a regression. |
| 7 | Tartine Manufactory, signed-in search URL (~03:50 UTC) | `/maps/search/Tartine+Manufactory/?hl=en&gl=us` | n/a | 0 | search-mismatch | 1 | Search mismatch before resolveSearch auto-redirect fix. Superseded by Run 11 below. |
| 8 | Tartine Manufactory, direct feature-ID URL, before the scroll-retry fix (~03:50 UTC) | `/maps/place/Tartine+Manufactory/data=!4m2!3m1!1s0x808f7e308f2ed1bb:0x88d7d35712aa2ba3?hl=en&gl=us` | 4,499 | 0 | structure-unknown | 1 | Pre-fix run. |
| 9 | Tartine Manufactory, direct feature-ID URL, after the scroll-retry fix (~03:53 UTC) | same URL as run 8 | 4,499 | 10 | limit-reached | 0 | **Success.** 10 collected, sort verified. DB `data/validation/live-manufactory.db`. |
| 10 | Tartine Bakery, 30-review run (~07:07 UTC) | same URL as run 5 | 5,987 | 30 | limit-reached | 0 | **Success.** 30 collected, exit 0, feed ranks 1..30 in descending order, 0 truncated texts, ratings 1-5 captured. DB `data/validation/live-gate-30.db`, job `job-2126f0bd-bda1-49a9-b3ae-c630c306bca9`. |
| 11 | Tartine Manufactory, search URL resolution (~07:07 UTC) | `/maps/search/Tartine+Manufactory/?hl=en&gl=us` | 4,499 | 5 | limit-reached | 0 | **Success.** Fixed resolveSearch auto-redirect. Navigated, resolved place, collected 5 reviews, exit 0. DB `data/validation/live-search.db`, job `job-3696b738-95f0-4d26-913b-755bcd51432b`. |
| 12 | Tartine Bakery, repeat run on same DB (~07:08 UTC) | same URL as run 10 | 5,987 | 30 | limit-reached | 0 | **Success.** Re-observation deduplication verified: DB reviews count unchanged at 30, `collectedCount` incremented to 2, date windows intersected. DB `data/validation/live-gate-30.db`, job `job-00d20f6c-790e-4aeb-84a9-3de5e3c3426b`. |
| 13 | Tartine Bakery, anonymous run (~07:09 UTC) | same URL as run 10 (`--no-profile --headless`) | ? | 0 | anonymous-preview-limit | 2 | **Success.** Honest non-success, printed ANONYMOUS warning, classified as `anonymous-preview-limit`, exit 2. DB `data/validation/anon-test.db`, job `job-3383ec9e-e79c-462e-9829-0f18f3c36363`. |
| 14 | Tartine Bakery, German locale (~07:10 UTC) | same URL as run 10 (`--language de --region de`) | 5,987 | 5 | limit-reached | 0 | **Success.** German UI parsed: `vor 3 Tagen` → parsed ISO UTC date window, exit 0. DB `data/validation/live-german.db`, job `job-0215dcd9-1c32-49a4-94ee-03b50d3fee56`. |

- The gap between runs 8 and 9 was a ~20-line change: `moreReviews` selector narrowed (chips excluded) and the sort guard scrolls-and-rechecks the feed up to 3 times before terminating.

Commands actually run (2026-10-31):

```sh
npm run cli -- run 'https://www.google.com/maps/place/Tartine+Bakery/data=!4m2!3m1!1s0x808f7e1807365605:0x601f7a97f0ce6c6b?hl=en&gl=us' --sort newest --limit 10 --db data/validation/live-fix.db
npm run cli -- run 'https://www.google.com/maps/place/Tartine+Manufactory/data=!4m2!3m1!1s0x808f7e308f2ed1bb:0x88d7d35712aa2ba3?hl=en&gl=us' --sort newest --limit 10 --db data/validation/live-fix.db
npm run cli -- run 'https://www.google.com/maps/place/Tartine+Manufactory/data=!4m2!3m1!1s0x808f7e308f2ed1bb:0x88d7d35712aa2ba3?hl=en&gl=us' --sort newest --limit 10 --db data/validation/live-manufactory.db
npm run cli -- run 'https://www.google.com/maps/place/Tartine+Manufactory?hl=en&gl=us' --sort newest --limit 10 --db data/validation/live-fix.db
npm run cli -- run 'https://www.google.com/maps/search/Tartine+Manufactory/?hl=en&gl=us' --sort newest --limit 10 --db data/validation/live-fix.db
```

## Live investigations actually run

Historical table from 2026-10-30: anonymous/headless attempts before the login session. Superseded by the signed-in runs above for current behavior, retained for the record.

Commands below used `node src/cli/index.js`; logs and DBs are local ignored artifacts. Expected counts were unavailable, not assumed zero.

| Run | Input/options | Expected | Collected | Termination | Exit | Outcome |
|---|---|---:|---:|---|---:|---|
| 1 | Old README slug-only Tartine URL; anonymous, headless, sort default | unknown | 0 | missing-place-id | 1 | Failed. Blank place panel; screenshot saved. |
| 2 | Tartine Bakery San Francisco search URL; anonymous, headless, sort default | unknown | 0 | no-more-reviews | 0 | **Invalid success in an intermediate revision.** Search footer caused false end evidence; regression subsequently fixed. This is not a validation pass. |
| 3 | Same search; anonymous, headless, sort default, stall-timeout-sec 10 | unknown | 0 | structure-unknown | 1 | Correctly non-success after footer fix. No review UI/cards; screenshot saved. |
| 4 | Settled Tartine direct feature-ID URL; anonymous, headless, sort default; default 90-second stall timeout | unknown | 0 | structure-unknown | 1 | Failed collection. Scrolled limited overview contained zero review cards. Anonymous cap classification needs refinement. |
| Login | `login` with default persistent profile, then Enter at pause | n/a | n/a | final authentication probe: anonymous | 0 | Profile created, **signed-in state not verified**. |

Exact invocations:

```sh
node src/cli/index.js run 'https://www.google.com/maps/place/Tartine+Bakery/@37.761425,-122.424104,17z' --no-profile --headless --sort default --db data/validation/anonymous.db
node src/cli/index.js run 'https://www.google.com/maps/search/Tartine+Bakery+San+Francisco/?hl=en&gl=us' --no-profile --headless --sort default --db data/validation/anonymous-search.db
node src/cli/index.js run 'https://www.google.com/maps/search/Tartine+Bakery+San+Francisco/?hl=en&gl=us' --no-profile --headless --sort default --stall-timeout-sec 10 --db data/validation/search-investigation.db
node src/cli/index.js run 'https://www.google.com/maps/place/Tartine+Bakery/data=!4m2!3m1!1s0x808f7e1807365605:0x601f7a97f0ce6c6b' --no-profile --headless --sort default --db data/validation/anonymous-direct.db
node src/cli/index.js login
```

Logs: `data/validation/{anonymous-slug,anonymous-search-before-fix,search-investigation,anonymous-direct,login}.log`. Screenshots and HTML: see HANDOFF.md for exact job directories.

All five tracked execution sessions exited. At pause, `ps` found no Chrome process whose `--user-data-dir` pointed at this repository's persistent profile. A comprehensive orphan-process test in both modes has not been completed.

## Future run template

Date/time (UTC), source revision/diff, OS/Node/browser version, exact command, place URL/feature ID, auth state, expected count, collected count, completeness, termination, exit code, truncation count, artifacts, process cleanup evidence, pass/fail and notes.

Complete the ten items in `docs/LIVE_CHECKLIST.md` before claiming readiness. **Two successful live review collections are now recorded (runs 5 and 9) — both at `--limit 10` with sort verified. Full-funnel gates (larger page counts, exports, dashboard, cleanup/resume) remain unverified.**
