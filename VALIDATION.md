# Validation — release gate NOT passed

Checkpoint: 2026-10-30 23:57 UTC. Node v26.7.0; macOS arm64; Google Chrome 156.0.8078.74.

## Offline checks actually run

- Baseline `npm test`: 44 passed, 0 failed, 0 skipped.
- Final checkpoint `npm run check`: exit 0; **100 passed, 0 failed, 0 skipped**; **23 source files** syntax checked.
- Subprocess SIGINT regression passed: exit 130, job interrupted, store closed, owned fake child absent.
- Real Google/Chrome interruption and full cleanup/resume remain unverified.

## Live investigations actually run

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

Complete the ten items in `docs/LIVE_CHECKLIST.md` before claiming readiness. **No successful live review collection has been recorded.**
