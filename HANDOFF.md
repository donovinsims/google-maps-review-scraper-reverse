# Hardening handoff — paused, release gate NOT passed

> **GitHub publication note:** The `handoff/hardening-checkpoint` branch publishes these handoff documents only. The implementation and tests described below remain in the local uncommitted working tree at `/Users/forex/google-maps-review-scraper-reverse`; they are not included in this GitHub branch. Before a remote agent resumes implementation, transfer that working tree to a separate work-in-progress branch. The test results below describe the local checkpoint, not this documentation branch.

Checkpoint: 2026-10-30 23:57 UTC. Paused at the owner's request to preserve quota. **Continue from the existing working tree; do not restart or revert it. No commits, pushes, or deployments were made.**

## Read first

1. This file.
2. `docs/HARDENING_SPEC.md`: the complete original attachment, copied here so it survives attachment cleanup.
3. `docs/DECISIONS.md`: approved deviations and implementation rulings.
4. `VALIDATION.md`: actual runs, including failed investigations. `docs/LIVE_CHECKLIST.md` contains the outstanding release gate.

The user approved implementation of phases 0–7, signed-in full-history collection as the primary use, and all ten live checks before readiness. Date windows must intersect and estimates use their new midpoint; the estimate is allowed to move later. Use the quota optimizer and Context Mode. Do not run CQO analytics automatically. Commits still require approval.

## Verified checkpoint

- `npm run check` **passed** immediately before pause: **100 tests passed, 0 failed, 0 skipped**, syntax checked **23 source files**.
- Baseline was 44 tests. Tests now cover the real runner, injected batch collector, production collection loop with a real synthetic DOM, migration, exports, dashboard HTTP routes, and subprocess SIGINT.
- Environment: macOS arm64; Node **v26.7.0**; installed Google Chrome **156.0.8078.74**. Node 22.13 compatibility has not been separately exercised.
- `linkedom` was installed as the sole new devDependency, with installation scripts disabled. Automatic browser installation was removed.
- Production login and all four collector processes started in this session have exited. Login exited 0 but its final probe was **anonymous**; exit 0 from `login` does not mean signed in. No Chrome process using this repository's persistent profile remained at pause (checked via `ps`). This is not the full anonymous/persistent orphan-process validation gate.

## Implemented change surface

- CLI is split into `program.js` and a thin entrypoint, with import-safe shared paths. Configuration validation, exit 64 for usage errors, aliases, region, profile false handling, doctor, retention, positional delete, and useful status output exist.
- Runner returns `{jobId,status,exitCode,summary}`; the CLI applies the exit code. Store/collector/clock injection is supported. Pending items are pre-created; resume uses original indices, including duplicate URLs. Saved options are restored and explicit options override them. Proxy credentials must be resupplied on resume.
- A central termination table and pure termination decision function control statuses. A drained serialized write queue enforces per-place limits before persistence. Final callbacks do not reinsert streamed reviews. Collector callback failures are reconciled into failed job checkpoints.
- SIGINT/SIGTERM use cancellation, close resources, preserve resumable state, and exit 130; second signal force exits. Retry uses the existing retry helper, now cancellation-aware; transient errors receive fresh pages and navigation. Closed-context retries rebuild context. Two consecutive blocks stop scheduling, preserving pending rows.
- Schema v2 migrations add date bounds, edit/truncation flags, feed rank, last-completed timestamp, diagnostics, expected/collected counts, and completeness. Incremental skipping depends on successful completion. Exports are deterministic, CSV has fixed headers/CRLF/BOM options/formula safety, JSON is schema 2, and output replacement is atomic.
- Dates use validated UTC uncertainty windows, calendar month/year subtraction, midpoint estimates, edited semantics, and English/German relative units. Store observations intersect compatible windows and report conflicts. Complete text survives truncated observations; complete shortened edits can replace it.
- Collector selectors are centralized. Extraction uses a real DOM and a single evaluation per pass for unseen records. Text expansion, owner/review separation, truncation flags, field coverage, feature IDs, requested-sort verification, consent handling, block detection, and diagnostic artifacts exist.
- Browser launch uses real identity/system timezone, requested locale, installed Chrome with availability-only bundled fallback, and no custom spoofing. Persistent concurrency defaults to 1. Unused `human.js`, `stealth.js`, and obsolete spoofing tests were removed.
- Dashboard uses Express 4, normalized database jobs, SQL-level review pagination, API JSON 404s, localhost Host validation, no CORS headers, and a repaired/paginated UI.
- Probe/POC scripts moved to `scripts/archive/` (not validation; historical relative imports are not maintained). Specified tracked POC JSON was removed. License/ignore rules updated.
- Added `scripts/check.mjs`, explicitly gated `scripts/test-live.mjs`, `tests/live/smoke.test.js`, and a production-launch-based fixture capture script. The live smoke and capture script have **not** been successfully exercised.

## Most important live discovery

Anonymous Google currently returned a **limited overview with zero review cards** for Tartine Bakery in this environment, not the assumed six-card preview. The place has Overview/About tabs, no Reviews tab, and a limited-view banner. The settled feature ID is:

`0x808f7e1807365605:0x601f7a97f0ce6c6b`

1. The old README slug-only URL opened a blank place panel and failed `missing-place-id`. Do not guess a business ID. Replace the README example with a settled feature-ID URL.
2. Search resolved the right business but initially returned `done`, zero reviews, because **a search-results footer** saying “You've reached the end of the list” was treated as a review end marker.
3. That false-success defect was reproduced with failing regressions and fixed: footer checks are now scoped to the review feed and exclude review-card text; zero collected without positive zero-review evidence cannot end successfully.
4. A review-disclosure button was also mistaken for a review-opening button. `moreReviews` selectors were narrowed, and overview scrolling can now find the business panel before cards mount. A failing DOM-loop regression passed after this fix.
5. Subsequent live search and direct-ID runs correctly failed `structure-unknown`, zero reviews, exit 1. **No successful live collection has occurred.** A complete direct-ID anonymous run waited the default 90-second stall interval and still found zero cards.
6. Current anonymous warning still says Google caps results at “about 6”. That is an unverified assumption and should be revised to reflect variable or unavailable anonymous review access. Decide and test whether an explicit limited-view page with no review UI should terminate `anonymous-preview-limit`/`sign-in-required` rather than generic structure failure. Do not invent an expected count or force six records.

Saved screenshots/HTML are under `data/diagnostics/`, and DBs/logs are under `data/validation/` (local ignored artifacts). The decisive screenshots are:

- `data/diagnostics/job-a1f1eed4-3670-4288-bc35-1d55f60cd30d/0-missing-place-id.png`
- `data/diagnostics/job-bf89de95-9bbf-4980-9aac-30d13d892247/0-structure-unknown.png` (search results plus place overview)
- `data/diagnostics/job-21244281-da43-48a2-9ce6-58f4c368dd72/0-structure-unknown.png` (scrolled anonymous overview, zero cards)

## Resume in this order

1. Run `npm run check` once to confirm the checkpoint. Inspect the current diff rather than rescanning the whole repo.
2. Review the new production code for remaining correctness gaps, adding failing regressions before changes. The implementation has **not had its final independent review**.
3. Finish anonymous limited-view classification using the observed page, with synthetic or scrubbed real fixtures. Preserve honest non-success when reviews are unavailable.
4. Arrange interactive login again: `npm run cli -- login`. The owner said they were ready, but the session was closed for this pause before any signed-in state was verified. `data/profiles/default` now exists; directory existence alone is not authentication. Never read credentials/cookies.
5. Run `doctor` after closing the login window. Do not run two processes against the same persistent profile.
6. Start the signed-in 30-review production CLI run, fix actual selectors/sort/feed behavior based on captured evidence, and re-run affected tests. A stable direct candidate already resolved in an anonymous run is shown below.
7. Complete all ten live checks, including a roughly 300-review place, zero-review place, real share link, German UI, actual Chrome cleanup/resume, stable repeat observations, and concurrency comparison. Record exact commands and outcomes.
8. Finish docs, issue/test evidence table, script validation, final review, and final `npm run check`. Only request phase commits after the work is reviewable.

Suggested live command, after **verified** sign-in:

```sh
npm run cli -- run 'https://www.google.com/maps/place/Tartine+Bakery/data=!4m2!3m1!1s0x808f7e1807365605:0x601f7a97f0ce6c6b' --profile default --require-login --headless --limit 30 --db data/validation/signed-in.db
```

## Known unfinished review items

These are inspection findings or concerns, not proven fixed defects; reproduce before editing:

- README and REQUIREMENTS still contain the old body/claims. A checkpoint warning was prepended, but the full rewrite and evidence grading remain undone.
- `doctor` combines browser/authentication failure into one line when launch fails instead of always printing a separate result for every required check. It has no dedicated regression test yet.
- Import tests suppress Node runtime warnings; they still assert no application stdout/stderr or argv parsing.
- Some selector strategy arrays (notably owner-date/profile fallbacks) lack individual strategy assertions. Expand fixture coverage as real evidence arrives.
- `Promise.all` in batch workers can reject before other workers finish if an unexpected error escapes. Review cancellation/joining so no worker can write after runner storage closes.
- Persistent-context rebuild after a closed-target error was implemented but needs its own regression beyond the anonymous-context test.
- `openDb` checks for unsupported future schema versions after running base schema/PRAGMA setup. Review whether to reject such databases before changing anything.
- Re-observation with a changed edited/un-edited meaning may need different date-window merge semantics. German month-only absolute labels may need locale propagation through normalization.
- Redaction now handles known proxy values, URL credentials, JSON-like headers/passwords, and credentialed invalid URLs in job items. Recheck all sinks, screenshots, and failure paths; existing historical DB secrets were not retroactively sanitized.
- `npm run check` syntax-checks `src`, not new `scripts/*.mjs`. Smoke/capture tools need separate syntax and behavior verification.
- The test suite creates no intentional external traffic. During early RED tests, the old collector ignored the not-yet-implemented injection seam and launched real browsers (some attempts had invalid URLs). The seam is now implemented and tested. Do not claim all development invocations were offline.
- No Node 22.13 run, real bundled-browser fallback run, full 10-check live gate, or final issue-by-issue completion audit has occurred.

## Useful tests

- `tests/core/config.test.js`: import safety, numeric/sort/URL validation, usage exit codes.
- `tests/core/runner.test.js`: real orchestration, limits, persistence failures, resume identity, callback failures, empty jobs.
- `tests/core/batch.test.js`: explicit failures, fresh-page/closed-context retries, circuit break, stream errors, persistent concurrency clamp, require-login.
- `tests/core/termination.test.js`: mappings, precedence, positive end evidence, anonymous stalls, false zero-result success.
- `tests/core/store-v2.test.js`, `dates.test.js`, `export-v2.test.js`, `redaction.test.js`: data behavior.
- `tests/core/interruption.test.js` with `tests/helpers/slow-cli.mjs`: actual CLI/runner subprocess SIGINT and owned fake-child cleanup.
- `tests/integration/scraper.test.js`: real-DOM extraction/expansion/strategy fixtures and false end markers.
- `tests/integration/collector-loop.test.js`: production loop with synthetic DOM, consent, sort failure, CAPTCHA, strict limit, anonymous overview scrolling.
- `tests/dashboard/server.test.js`: ephemeral localhost server, normalized jobs, pagination cap, invalid queries, API 404, foreign Host rejection.

Resume prompt: **Read HANDOFF.md and the referenced spec/decisions/validation, preserve the existing changes, and continue the remaining hardening and live validation. The last check was 100 passing tests; live collection is still unproven.**
