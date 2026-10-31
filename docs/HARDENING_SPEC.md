# Master Prompt: Harden the `gmaps-reviews` scraper

Built from a full review of the repo on Oct 30, 2026. Paste everything below into a coding agent (Claude Code, Cursor, etc.) opened at the repo root.

## 0. Role and goal

You are a senior Node.js engineer hardening this local Google Maps review collector. Priorities, in order: (1) accurate data, (2) honest reporting (never say success when it is not), (3) repeatable results, (4) clear failure messages. Not speed. Not stealth.

## 1. Operating rules

- Work in the phases below. For every issue ID: write a failing test first (or a documented manual check if it needs live Google), fix it, confirm green. Run `npm test` after each phase and commit with `phase N: <summary>`.
- Do not add features beyond this brief. Do not add CAPTCHA solving, new anti-detection code, or evasion. Where this brief removes or disables spoofing, the reason is consistency, not detection.
- Unit tests never touch the network. Live tests are opt-in (`LIVE=1`).
- Node >= 22.13, ESM, built-in `node:sqlite`, `node:test`. The only new dependency allowed is one DOM library as a devDependency (`linkedom` or `jsdom`) for HTML fixtures.
- Never mark anything verified, passing or done in any doc unless you actually ran it. If you cannot reach Google from your environment, implement and unit-test everything, then list what remains unverified in `docs/LIVE_CHECKLIST.md`.
- Never present invented HTML as a live capture. Hand-written fixtures go in `tests/fixtures/synthetic/`, real captures in `tests/fixtures/live/`.
- Prefer deleting dead code to keeping it. On ambiguity, pick the safest behaviour, add one line to `docs/DECISIONS.md`, and continue.

## 2. Context: what the review found

The 44 existing tests pass but cover only helpers (dates, retry, store, exporters, URL helpers). Nothing tests `scrapePlaceReviews`, `batch.js` or `runner.js`. The 7 committed POC runs in `data/poc/` returned 0 reviews six times and 3 once (limit 25; the place has 5,987). Those runs used `scripts/poc.mjs` with vanilla `playwright` and a Chrome/156 UA, not the `src/` launch path, so there is no evidence `src/` works end to end. `VALIDATION.md` (cited by REQUIREMENTS.md) does not exist.

**Reproduced (V):**

- **V1** If every URL throws, the job ends `completed`, exit code 0, "0 failed". Cause: the `catch` in `batch.js` pushes `{listingUrl,error,durationMs}` with no `status`, and the return value of `onComplete` is discarded.
- **V2** `--concurrency abc` gives NaN, zero workers, `completed`, exit 0. `--limit abc` silently means unlimited. `--sort relevant|oldest|highest_rating|lowest_rating` silently falls back to newest (`sortPattern`). An invalid URL is retried 3 times with backoff.
- **V3** `--incremental`: `isPlaceCollected` only checks that a `businesses` row exists and `lastSeenAt` is recent. A preview-only, blocked or failed run counts as collected, and a skipped place refreshes its own `lastSeenAt`, so it never expires.
- **V4** `--resume`: `batch.js` numbers the filtered list from `idx` 0, so `recordJobItem` overwrites finished rows (and never updates `inputUrl`).
- **V5** `extractInPage` reads `reviewText` with `q('.wiI7pd')` (first match). For a rating-only review with an owner reply, that is the reply. Confirm against a real-DOM fixture.
- **V6** Dates: relative dates are recomputed from each collection time and the newer value overwrites the old one (a year-old review drifts later on every run). `5 mins ago` and `3 hrs ago` parse to null (the unit lookup uses `k.slice(0,4)`). Hour precision is labelled `minute`. "Edited 3 months ago" is stored as the publish date. `publishedDateParsed` mixes formats (`2021-03`, `2021-03-04`, full timestamps). ISO and calendar dates are not validated (Feb 31 rolls over).
- **V7** `collectedCount` is 2 after one run (stream upsert plus final upsert). Streaming persists reviews before `--limit` truncation, so the DB can hold more than the limit.
- **V8** CSV: an empty export has no header row; no UTF-8 BOM (Excel garbles accents and emoji); `--format` is not validated (anything but `json` becomes CSV); `translatedByGoogle` exports as 1/0.

**Suspected from reading (S), so confirm each with a test or by reading before fixing:**

- **S1** The "See more" loop clicks `mores.nth(i)` on a locator that shrinks as buttons disappear, so about half are skipped and truncated text is stored permanently (`seen` blocks re-reading). The selector also includes `button[aria-label="More"]`, which may be a menu. A POC owner reply ended with "… More".
- **S2** Every pass re-reads all mounted cards one `elementHandle` at a time (O(n^2) round trips, handles never disposed). With the 300 s cap, large places end as `timeout`. `maxMoreClicks` is unused.
- **S3** An anonymous run that hits Google's \~6-review cap reports `done` (exit 0) unless an exact English banner is found. There is no collected-vs-`reviewsCount` check and no warning when no login profile exists.
- **S4** `placeId` is parsed from `finalUrl`, captured before the place panel settles. Direct place URLs (like the README example) may not have `!1s0x…:0x…` yet, giving `missing-place-id`. Also, the ID is Google's hex feature ID, not a `ChIJ…` Place ID as the README says.
- **S5** On retry, `alreadyHere` skips `goto`, and the same (possibly dead) page is reused.
- **S6** A failed sort click is swallowed (`onProgress` events other than `stream-batch` are ignored). A fixed 1.2 s sleep follows the sort, so stale cards may be collected.
- **S7** Lifecycle: the job stays `running` forever if launch throws (no catch). The SIGINT handler calls `process.exit(130)` before browsers or contexts close. `browser?.process?.()` is not a Playwright API, so the force-kill is a no-op, and persistent contexts have no force-kill at all.
- **S8** A consent redirect (`consent.google.com`) is misdiagnosed as `structure-unknown`. `src/` relies on a static magic `SOCS` cookie, while `scripts/poc.mjs` has a consent-button click that `src/` lacks.
- **S9** Obfuscated class names (`kvMYJc`, `wiI7pd`, `d4r55`, `rsqaWe`, `CDe7pd`…) are the only selectors, with no drift alarm. Null fields still end as `done`. Place `rating` was null in every POC run.
- **S10** Fingerprint is inconsistent: random UA and timezone on every launch of a signed-in persistent profile; UA pool stuck at Chrome 130/131; `fp.brands` computed but never applied; WebGL says "Intel UHD 630" on an Apple Silicon target; README claims canvas noise and Sec-CH-UA randomization that do not exist.
- **S11** `--concurrency > 1` shares one headed persistent context across tabs; background-tab throttling may starve pagination. Unverified.
- **S12** `classifyPage(url, bodySnippet)` is never given a body, so mid-scrape CAPTCHA detection is dead code. `/unusual traffic/` is tested against a URL.
- **S13** `onBatch(...).catch(() => {})` swallows DB write errors.

**Docs and housekeeping (D):**

- `npx gmr` likely resolves to an unrelated registry package.
- `delete` is `--placeId`, not positional. `status` does not show jobs. `--profile false` makes a profile named "false". Sort names and defaults, `--language` default and schema field names differ between README and code.
- Badge says 40 tests (there are 44). No `LICENSE`. `package.json` says Node >= 22.0.0 but `node:sqlite` needs 22.13+.
- REQUIREMENTS claims Q2 ("no bypass"), Q6 (redaction), Q7 (`gc`) and Q9 (VALIDATION.md) that do not exist or contradict the code. The proxy password is stored in plaintext in `jobs.config`. Diagnostics are returned by the scraper but never persisted.
- Dashboard "Recent runs" is always empty (field names mismatch). The dashboard loads every review then slices 50 in the browser.
- `data/poc/*.json` publishes real reviewers' names and profile URLs. `scripts/probe*.mjs` are throwaway.
- Unused: `human.js` imports in `place-reviews.js`, `maxMoreClicks`, `fp.screen`, `fp.brands`.

---

## Phase 0: Foundation

1. **Kill import side effects (circular import).** `runner.js` and `dashboard/server.js` import `PROJECT_ROOT` from the CLI entry, which runs `parseAsync(process.argv)` on import. Create `src/core/paths.js` (`PROJECT_ROOT`, `DEFAULT_DB`), `src/cli/program.js` (`buildProgram()`, no side effects) and a thin `src/cli/index.js` (shebang plus `buildProgram().parseAsync()`). Test: importing runner, program and dashboard in a child process with junk argv must not exit or print.
2. **Dependency injection for tests.** `collectForPlaces(config, deps = { createStore, launchBatchCollector, now })`.
3. **Config validation (V2).** New `src/core/config.js` with `parseRunOptions(opts)`:
   - `limit`: positive integer or undefined. `concurrency`: integer 1 to 4, otherwise a usage error (do not silently clamp).
   - `sort`: canonical `newest|relevant|highest|lowest|default` (`default` = do not touch Google's current sort). Aliases: `highest_rating`→`highest`, `lowest_rating`→`lowest`, `most-relevant`→`relevant`. `oldest` and anything else is a usage error that lists valid values.
   - `language`: `^[a-z]{2}(-[A-Z]{2})?$`. New `--region` (default `us`) replaces the hardcoded `gl`.
   - `--profile false` is treated as `--no-profile`. `--proxy` is parsed up front.
   - URLs are validated before any browser launches. Invalid URLs become an item with status `failed`, reason `invalid-url`, never retried.
   - Exit codes: 0 completed, 1 failed, 2 partial, 3 blocked, 64 usage/config error, 130 interrupted.
4. **Package and CLI hygiene (D).** `engines.node >= 22.13.0`. Add `"gmr": "node src/cli/index.js"` script; README uses `npm run cli -- <cmd>` (or `npm link` then `gmr`) and never `npx gmr`. `delete <placeId>` positional (keep `--placeId` as an alias). `status` prints places with expected vs collected, plus the last 10 jobs with per-status counts. Add `gc --older-than <days>` using `retentionVacuum`. Add `doctor` (checks Node version, `node:sqlite`, browser executable, DB writable, profile exists, signed-in state) and print a pass/fail line for each.
5. **Repo hygiene.** Delete `data/poc/*.json` and add `data/poc/`, `data/diagnostics/`, `*.db-journal`, `test-*.db*` to `.gitignore`. Move `scripts/poc.mjs` and `probe*.mjs` to `scripts/archive/` with a README note (they use a different launch path and are not validation). Delete dead code (unused `human.js` imports or the whole file, `maxMoreClicks`, `fp.screen`, `fp.brands`). Add MIT `LICENSE` (holder as in the README).

## Phase 1: Honest status, retries, lifecycle

1. **Termination table (V1, V2, S3).** New `src/core/termination.js` exporting every reason with its item status and retryability; runner, batch and tests all use it.
   - done: `limit-reached`, `no-more-reviews`, `no-reviews` (zero reviews positively detected)
   - skipped: `skipped-incremental`
   - partial: `incomplete`, `anonymous-preview-limit`, `pagination-stall`, `timeout`, `sign-in-required`, `structure-drift`
   - blocked: `blocked`, `captcha`, `sign-in-wall`, `consent-wall`
   - failed: `missing-place-id`, `search-mismatch`, `structure-unknown`, `invalid-url`, `sort-failed`, `persistence-error`, `failed` Test: parse `place-reviews.js` (or export its reason list) and assert every emitted reason is mapped. An unmapped reason must fail loudly, never fall through to `done`.
2. **Uniform result shape (V1).** Every summary entry from `batch.js`, including the catch path, has `{listingUrl, idx, placeId, placeName, status, collected, expected, termination, error, attempts, durationMs}`. Use the value returned by `onComplete`; if `onComplete` itself throws, still push `status:'failed'`.
3. **Job status and exit code.** Precedence: failed > blocked > partial > completed. Print a final table (URL, status, collected/expected, reason). A job with zero processed items is `failed`, never `completed`.
4. **Retry correctness (S5, V2).**
   - Each attempt creates a fresh page, always calls `goto`, and closes the previous page.
   - Retry only transient errors: navigation timeout, `ERR_*` network errors, target closed (rebuild the context first). Never retry validation errors, blocked, sign-in or consent results.
   - Record the real `attempt` count.
5. **Lifecycle (S7).**
   - Wrap the whole run in try/catch/finally: any thrown error sets the job to `failed` with the message, then rethrows.
   - Replace the SIGINT/SIGTERM handler with an `AbortController` passed to the collector. On abort: stop taking new URLs, close pages, contexts and browser with a 10 s timeout, set the job to `interrupted`, then exit 130. A second signal force-exits.
   - Delete the `browser.process()` force-kill. After the close timeout, log and exit non-zero, and prove empirically (`pgrep -fl chrome`) that no orphan Chromium survives in both persistent and anonymous modes. Document the method in `docs/DECISIONS.md`.
   - Close the DB (`store.close()`) on every exit path.
   - A launch failure from a locked profile (SingletonLock or "profile in use") must produce a clear message and a `failed` job.
6. **Circuit breaker.** After 2 consecutive `blocked` or `captcha` items, stop the queue, mark the remainder `pending`, and exit 3 with a message. Add `--delay-ms <min,max>` (default 3000,8000) between places.
7. **Persistence (S13, V7).**
   - Persist reviews through one serialized write queue. A write error marks the item `persistence-error` and surfaces in the summary. Never swallow it.
   - Persist each review once: stream batches write reviews; the final callback writes only business meta and the job item.
   - Enforce `--limit` before persisting (slice batches so the DB never gains more than the limit in a run).
8. **Resume (V4).**
   - At job creation, insert a `job_items` row (`pending`) for every URL with `idx` = position in `config.listingUrls`. Pass `{url, idx}` pairs to the collector so indices are stable.
   - `recordJobItem` must refuse (throw) when an existing row has a different `inputUrl` for that `idx`.
   - `run --resume <jobId>` makes `<urls...>` optional and restores the saved options (`limit`, `sort`, `language`, `region`, `concurrency`), overridable from the CLI.
   - Pending set = items not `done` or `skipped`.
9. **Secrets (D).** `redact()` utility strips `user:pass@` in URLs, proxy credentials, and cookie/authorization strings. Apply it to stored `jobs.config`, console output, error text, `pageErrors` and diagnostics. On resume the user re-supplies `--proxy`. Test: no proxy password appears anywhere in the DB, console or diagnostics after a run with a credentialed proxy.

## Phase 2: Data accuracy

1. **Selectors module.** `src/collector/selectors.js`: per field, an ordered list of strategies, stable ones first (`data-review-id`, `role=img` plus star aria-label, `button[data-href*="contrib/"]`, `role=feed`, `role=tab`, aria-labels), obfuscated classes last. Every field has a fixture test per strategy.
2. **Extraction (V5, S1).** Rewrite `extractInPage` in a way that works on a real DOM and is tested with linkedom/jsdom:
   - Review body is the text node/span that is not inside the owner-response container. Owner response is read only from inside it.
   - Remove button/"More"/"See more" elements from a clone before reading text.
   - Rating: strict parse (`^(rated\s+)?([1-5])(\.0)?\s*(stars?|/5|out of 5)`); unparseable gives `rating=null` and keeps `ratingRaw`. Remove the "first digit wins" fallback in `normalizeRating`.
   - Fixtures (synthetic): rating-only plus owner reply, truncated with See more, translated, edited, no date, emoji and RTL text, missing author.
3. **Expansion (S1).** One in-page `evaluate` clicks every collapsed-text button scoped to `div[data-review-id]` (review and owner response), waits for the DOM to settle, repeats until none remain or a cap. Drop `button[aria-label="More"]`. After expansion, if a card's text still ends with a truncation marker, set `textTruncated=1` on the record. Never silently store truncated text as complete. Test with a fixture whose buttons remove themselves on click.
4. **Extraction performance (S2).** One in-page call per pass returns plain data only for cards whose `reviewId` is not already collected (pass the seen IDs in). No `elementHandle`s. Record `feedRank` (order of first appearance). Remove the misleading `duplicates`/`duplicateRate` (it counts re-observations); keep a real count only for same-ID-different-content.
5. **Field-coverage canary (S9).** After every batch of >= 10 cards, compute the share with `reviewerName`, `rating` and `publishedDateRaw`. Below 90% for any field, stop with `structure-drift` (status `partial`, or `failed` if nothing usable) and name the failing field and selector. Persist `fieldCoverage` in diagnostics. Fix `pickPlaceRating` (null in every POC run) with fallbacks and a fixture.
6. **Dates (V6).** Rewrite `src/core/dates.js`; every date result is `{earliest, latest, estimate, precision, relative, edited}` with ISO 8601 UTC timestamps.
   - "N unit ago" (N >= 1; "a/an" = 1) means the window `[now-(N+1)*unit, now-N*unit]`. Use calendar arithmetic (UTC) for months and years, not 30/365-day constants. `estimate` = midpoint. Precisions: minute, hour, day, week, month, year. Accept abbreviations (min, mins, hr, hrs). Keep `"just now"`-style strings null unless trivially defined.
   - Absolute dates are calendar-validated (reject Feb 31). Explicit-locale month tables still work. Epoch handling stays.
   - A leading "Edited" sets `edited=true`. The dates then describe the last edit, not the original post, and the README says so.
   - Store columns: `publishedDateRaw`, `publishedDateParsed` (the estimate), `publishedDateEarliest`, `publishedDateLatest`, `datePrecision`, `isEdited`. Same for owner response (`ownerResponseDate*`). Always full ISO timestamps.
   - Store merge: on re-observation, intersect windows (`earliest = max`, `latest = min`) and recompute the estimate. If the windows are disjoint, take the new one and note it in diagnostics. Test: collect "a year ago" at two times six months apart; the window narrows and the estimate never drifts later.
7. **Store (V7).** Schema v2 through ordered migrations tracked with `PRAGMA user_version`, with `ALTER TABLE ADD COLUMN` guarded by `table_info`. New columns: `reviews.textTruncated, isEdited, publishedDateEarliest, publishedDateLatest, ownerResponseDateEarliest, ownerResponseDateLatest, feedRank`; `businesses.lastCompletedAt`; `job_items.diagnostics, expectedCount, collectedCount, completeness`. Test: a v1 DB migrates without data loss.
   - Set `PRAGMA foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL` explicitly.
   - `collectedCount` increments only when `excluded.runId` differs from the stored `runId`.
   - `reviewText` merge rule: take the new text when it is non-null and not truncated (so a shortened edit updates); never replace a complete text with a truncated one.
   - `listingUrl` must be non-null (guard before insert).
   - `selectReviews` order is deterministic: `placeId, publishedDateParsed DESC, reviewId`.
   - `deleteReviews` also removes `job_items` rows for that place.
   - `isPlaceCollected` uses only `lastCompletedAt`, set only when an item finishes `done` with a passing completeness check. A skipped item never touches it (V3). Add `--incremental-days <n>` (default 7). If the input URL already contains the feature ID, skip before navigating.
8. **Exports (V8).** Fixed `EXPORT_COLUMNS` order. CSV always has a header, even when empty; CRLF line endings; UTF-8 BOM when writing to a file (`--no-bom` to disable); formula guard only for string cells starting with `= + - @ tab CR` (never for numeric values), with `--raw-csv` to opt out; booleans as `true`/`false`/empty; `--format` must be `csv|json` or it is a usage error; writes are atomic (temp file then rename). JSON export bumps `schemaVersion` to 2 and lists `columns`. README states JSON is not formula-guarded.

## Phase 3: Completeness and anonymous-mode honesty

1. **Auth state (S3).** `detectAuthState(context)` returns `signed-in|anonymous|unknown`, using stable signals (account button/aria-label, absence of sign-in prompts) and never reading credentials. Log it at start of every run and store it in the job config and every termination. If anonymous: print "ANONYMOUS: Google caps results at about 6 per place". `--require-login` aborts with exit 64 when not signed in. `gmr login` waits for the window to close (or Enter), then runs the probe and prints the result. If Google shows its "browser may not be secure" refusal, detect it and print guidance. Do not add workarounds.
2. **Termination decisions as a pure function.** `decideTermination(state)` (passes, stalls, elapsed, collected, expected, authState, limit, endMarkerSeen, spinnerVisible) returns a reason or `continue`. Unit-test it exhaustively.
   - `no-more-reviews` requires positive evidence: an end marker, or collected >= 0.98 \* expected. Otherwise a stall is `pagination-stall` (partial). A stall counts only when the card count is unchanged, no loading indicator is visible, a recovery cycle has run (re-click tab, scroll up then down) and a minimum wait has passed.
   - When anonymous and collected < expected, the reason is `anonymous-preview-limit`, independent of any English banner text.
3. **Completeness (S2, S3).** Record `expected` (from the Reviews tab or More-reviews label), `collected` and `completeness`. When the run ended without hitting `--limit` and `completeness < --min-completeness` (default 0.9), status is `partial` with reason `incomplete`. Document that Google's count may include ratings without text, so the threshold is a warning signal, not proof.
4. **Timeouts (S2).** Replace the flat 300 s cap with a progress-based stall timeout (default 90 s without a new review) plus a hard ceiling `--place-timeout-min` (default 60).
5. **Place ID (S4).** After the panel appears, poll `page.url()` for up to 15 s for the `!1s0x…:0x…` feature ID; fall back to hrefs on the page that contain it. Extract the logic into a pure `extractPlaceId(url)` in `src/core/place-id.js` with tests for several URL shapes (direct place, search-resolved, share-link-resolved, URL-encoded, no ID). Build `place.url` from the settled URL. README and docs call it the "feature ID".
6. **Sort (S6, V2).** Map `newest|relevant|highest|lowest` to menu items; unknown values throw. After clicking, verify via the control's label or `aria-checked`, and wait for the feed to re-render (first card ID changes or a settle check) before collecting. If unverifiable after 2 attempts with an explicit sort, terminate `sort-failed` (status `failed`) and persist nothing. Record `sortApplied` in the termination.
7. **Consent (S8).** If the URL host is `consent.google.com` or the page shows a consent form, click through using stable form/role selectors (reuse the approach in the archived `poc.mjs`). If that fails, terminate `consent-wall` with a screenshot. Keep consent cookies as an optional best effort only.
8. **Blocking and diagnostics (S12, D).**
   - Mid-scrape check passes a body snippet (first 2 KB of `innerText` plus presence of a recaptcha iframe) to `classifyPage`.
   - Delete the `unusual traffic` URL test. Add a test for `/sorry/`, recaptcha iframe and sign-in URLs.
   - On any non-`done` end, save `data/diagnostics/<jobId>/<idx>-<reason>.png` and a redacted, size-capped `.html`, and persist the diagnostics object (moreClicks, staleElements, pageErrors, fieldCoverage, authState, sortApplied) into `job_items.diagnostics`.

## Phase 4: Browser launch hygiene

1. **Consistent fingerprint (S10).** Do not override UA, timezone or WebGL by default. Use the real browser's identity, locale from `--language`, and the system timezone. If any override stays, make it opt-in (`--spoof`) and derive it from `browser.version()`, apply it consistently, and persist it per profile in `data/profiles/<name>/fingerprint.json` so a signed-in profile looks the same across launches. Fix the README to describe exactly what the code does.
2. **Launch.** Try `channel:'chrome'` and fall back to bundled Chromium on failure, logging which was used (replace the macOS-only `/Applications/...` check). Do not run `npx playwright install` on every run: check `chromium.executablePath()` and print the exact install command if missing. Confirm which package's CLI installs the browser `rebrowser-playwright` expects. Remove the `2>/dev/null` shell redirect. Route `--language` into `--lang`, locale and `hl`.
3. **Concurrency (S11).** Persistent-profile runs clamp to concurrency 1 with a warning unless `--unsafe-concurrency`. Add a live-checklist item that compares yield at concurrency 1 vs 2 before anyone raises the default.

## Phase 5: Dashboard

- `/api/jobs` returns normalized jobs (id, status, notes, createdAt, per-status item counts). Delete the file-fallback path. Update `index.html` to render job fields (status, counts, completeness). Fix the "Recent runs" table.
- Paginate `/api/places/:id/reviews` (`limit`, `offset`, capped at 500). Return 404 JSON for unknown `/api/*` instead of `index.html`.
- Reject requests whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>`. Add no CORS headers.
- Pick one Express major and remove the stale "Express 5" comment. Test the API with an in-process server on an ephemeral port.

## Phase 6: Test suite

- `npm test` runs unit and mocked tests only. `npm run test:live` requires `LIVE=1`. Add `npm run check` (tests plus `node --check` on every file in `src`). Replace the hand-rolled mock DOM in `tests/integration/scraper.test.js` with linkedom/jsdom. The existing `reviewUrl` test re-implements the template instead of calling `finalizeRecord`; make it call the real code.
- Add a regression test for every ID: V1 to V8, S1 to S13, D. Name each test with its ID, for example `V1: all URLs throw => job failed, exit 1`.
- Also required:
  - Runner end-to-end with an injected fake collector: all failed, mixed, all partial, blocked, zero reviews, interrupted, resume (original indices preserved), incremental (skip then still expires).
  - Property-style date tests (random N, unit, `now`) asserting `earliest <= estimate <= latest`.
  - Store migration, merge rules and deterministic ordering.
  - A subprocess test that sends SIGINT to a CLI run with a slow fake collector and asserts: job `interrupted`, exit 130, DB closed, no orphan child process.
- `scripts/capture-fixture.mjs`: opens a given place in a headed browser and saves the review-card HTML (names and profile URLs scrubbed) plus selected page-level snippets to `tests/fixtures/live/`, so selector drift can be fixed by re-capturing and re-running tests.

## Phase 7: Docs and validation

- Rewrite `README.md` to match the code exactly: commands, option table with canonical values and defaults, exit codes, statuses and terminations, actual schema field names (including new columns), date-window semantics, what `completeness` means, known limitations (anonymous cap, selector drift, Google's count vs listed reviews, `Edited` dates), troubleshooting, and a short risk note that automated access may violate Google's terms and may put a signed-in account at risk. Drop the hardcoded test-count badge and unverifiable claims ("SeleniumBase-grade", canvas noise, Sec-CH-UA, binary-level patches).
- Re-grade `REQUIREMENTS.md` honestly: no ✅ without a test or a dated VALIDATION entry. Rewrite Q2 to state exactly what happens on a block (stop, classify, save diagnostics, no bypass) and make the code match.
- Create `VALIDATION.md` as a template only (date, command, place, expected, collected, termination, exit code, notes). Do not fill it with invented runs.
- Create `docs/LIVE_CHECKLIST.md` for the owner to run and record in `VALIDATION.md`:
  1. `doctor`, then `login`, then `doctor` shows signed-in.
  2. The README's direct place URL with `--limit 30`: 30 collected, exit 0, `textTruncated` count 0, `feedRank` consistent with newest-first dates.
  3. A share link and a search URL.
  4. An anonymous run: exit 2 with `anonymous-preview-limit` and a visible ANONYMOUS warning.
  5. A \~300-review place with no limit: completeness >= 0.9, exit 0.
  6. Ctrl+C mid-run: no orphan Chrome, job `interrupted`, `--resume` finishes only the remainder.
  7. Re-run the same place: row counts stable, date windows narrowed (not drifted).
  8. A place with zero reviews: `done`, 0 collected.
  9. `--language de`.
  10. Concurrency 1 vs 2 yield.

## Definition of done

- `npm run check` is green with no skipped tests and the test count is higher than 44.
- Every ID (V1 to V8, S1 to S13, D) has a regression test, a documented live check, or a stated reason it was not fixed.
- No code path can return `done` or exit 0 for a run that failed, was blocked, or was truncated or incomplete without saying so.
- No secret appears in DB, logs or diagnostics. Importing any module has no side effects.
- README, REQUIREMENTS and the code agree.

**Final report format:** a table of ID, status (fixed with test / fixed needing live check / not fixed with reason), the test names that cover it, the final test count, a list of everything unverified against live Google, and any decisions logged in `docs/DECISIONS.md`.
