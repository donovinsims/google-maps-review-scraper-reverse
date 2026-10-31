# Live release checklist — outstanding

Use the production CLI, separate validation DBs, actual public places, and the template in `../VALIDATION.md`. Tests/fixtures are not substitutes for these checks. Do not invent counts or captures. Avoid simultaneous use of one persistent profile.

| # | Check | Required evidence | Current state |
|---|---|---|---|
| 1 | doctor → interactive login → doctor | Each prerequisite result; final verified signed-in state | Login attempted; final probe anonymous. Doctor sequence not yet run. |
| 2 | Direct settled place URL, newest sort, limit 30 | 30 collected, exit 0, no truncated text; observed ranks compatible with date uncertainty windows | Not run signed-in. Old slug-only example failed and needs replacement. |
| 3 | Actual share link and search URL | Both resolve the intended business and collect accurately | Search resolved Tartine but collected 0 anonymously. No share link tested. |
| 4 | Anonymous run | Visible anonymous warning; honest non-success and appropriate cap/sign-in reason when Google limits access | Warning observed; zero cards and structure-unknown/exit 1. Refine observed limited-view classification; not passed. |
| 5 | Roughly 300-review place, no limit | Completeness ≥0.9, exit 0, recorded expected/collected counts | Not run; choose and record an actual place. |
| 6 | Ctrl+C then resume | Job interrupted, exit 130, no owned orphan Chrome in persistent and anonymous modes; resume skips completed original indices | Offline subprocess passed. Actual Chrome sequence not run. |
| 7 | Repeat same place | Stable row counts, once-per-run counts, intersected/narrowed date windows rather than blind overwrite | Offline merge tests passed; live not run. |
| 8 | Verified zero-review place | Positive zero evidence; done/0 collected/exit 0 | Synthetic tests passed; live not run. |
| 9 | German language | Correct UI locale, extraction, sort, raw dates and supported parsed dates | Synthetic tests passed; live not run. |
| 10 | Concurrency 1 vs 2 | Same place set, comparable yield; explicit unsafe override for persistent concurrency 2 | Clamp/override unit tests passed; live comparison not run. |

Use `--require-login` for signed-in tests. `npm run test:live` is a gated 30-review smoke test only, not this entire checklist; it needs `LIVE=1 LIVE_PLACE_URL='<url>'` and an already authenticated profile. Capture scripts need their own verification before relying on them.
