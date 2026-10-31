# REQUIREMENTS.md

Acceptance matrix for the self-hosted Google Maps reviews collector.
Status column: ✅ = implemented and verified with tests, 🟡 = implemented, awaiting live release gate, ⛔ = not done.

## Hard constraints
| # | Requirement | Status |
|---|---|---|
| C1 | Runs locally on the user's machine (macOS ARM64, Node >= 22.13.0) | ✅ verified with tests and doctor |
| C2 | No required paid scraping API | ✅ none used |
| C3 | No vendor license server | ✅ |
| C4 | No built-in monthly subscription quota | ✅ (Google's access limits still apply) |
| C5 | No required paid proxy service | ✅ (optional proxy passthrough supported) |
| C6 | No mandatory cloud account or telemetry | ✅ nothing leaves the machine but page requests |

## Inputs / outputs
| # | Requirement | Status |
|---|---|---|
| I1 | Accept a Google Maps place/search/share URL | ✅ verified across URL shapes |
| I2 | Batch input (one URL per line file, or array) | ✅ verified in runner & batch tests |
| O1 | Export CSV (with header, BOM, CRLF, and formula protection) | ✅ verified in export-v2.test.js |
| O2 | Export JSON (versioned schema, `schemaVersion: 2` with explicit columns) | ✅ verified in export-v2.test.js |

## Collection semantics
| # | Requirement | Status |
|---|---|---|
| S1 | Extract individual reviews (not only counts) | ✅ real-DOM extraction verified |
| S2 | Sort modes: `default`, `newest`, `relevant`, `highest`, `lowest` | ✅ verified sort application and failure handling |
| S3 | Max review count per business (`--limit`) | ✅ enforced before persistence |
| S4 | Deduplicate reviews (composite key: `placeId + reviewId`) | ✅ verified in store-v2.test.js |
| S5 | Persist jobs; resume interrupted runs | ✅ original indices preserved, resume tests pass |
| S6 | Explicit partial/failed reporting; typed termination reasons | ✅ 18 reasons mapped, precedence tested |
| S7 | Configurable concurrency, timeouts, and cancellation | ✅ verified in batch, runner, and interruption tests |
| S8 | Incremental collection (`--incremental`, `--incremental-days`) | ✅ verified based on last completed pass |

## Review fields
Collected when the page presents them; otherwise `null` (never fabricated):
`reviewId`, `placeId`, `reviewerName`, `reviewerProfileUrl`, `rating`, `ratingRaw`, `reviewText`,
`textTruncated`, `originalLanguage`, `translatedByGoogle`, `publishedDateRaw`, `publishedDateParsed`,
`publishedDateEarliest`, `publishedDateLatest`, `datePrecision`, `isEdited`, `ownerResponse`,
`ownerResponseDateRaw`, `ownerResponseDateParsed`, `ownerResponseDateEarliest`, `ownerResponseDateLatest`,
`reviewUrl`, `listingUrl`, `feedRank`, `collectedAt`.

Precision convention: raw strings preserved verbatim; parsed dates represent uncertainty windows
`[earliest, latest]` with midpoint estimates. Multiple observations intersect windows.

## Safety / quality
| # | Requirement | Status |
|---|---|---|
| Q1 | Consent screens handled via public UI buttons | ✅ verified in collector-loop.test.js |
| Q2 | On blocker (reCAPTCHA, `/sorry/`, sign-in wall): stop, classify, save diagnostics, circuit breaker, exit non-zero, no bypass | ✅ verified in batch and loop tests |
| Q3 | Bounded retries with backoff and fresh pages | ✅ transient only; 3 attempts |
| Q4 | CSV formula-injection protection (`=`, `+`, `-`, `@`, `\t`, `\r` escaped) | ✅ verified in export-v2.test.js |
| Q5 | Local-only dashboard binding (`127.0.0.1` / `localhost`) | ✅ Host validation and CORS absence verified |
| Q6 | Secrets/token redaction in logs, DB config, error text, and diagnostics | ✅ verified in redaction.test.js |
| Q7 | Retention/deletion control (`delete <placeId>` and `gc --older-than <days>`) | ✅ verified in store and program tests |
| Q8 | Unit and integration test suite with synthetic real-DOM fixtures | ✅ 111 tests passing offline |
| Q9 | Live validation on varied businesses | ✅ verified live on multiple businesses (Tartine Bakery, Tartine Manufactory), search URL resolution, 30-review extraction, repeat window intersection, German locale, anonymous classification, and exports |
| Q10 | Parity measurement vs. reference product | ⛔ untested — no lawful reference output available; labeled as such everywhere |
