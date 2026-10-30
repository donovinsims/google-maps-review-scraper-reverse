# REQUIREMENTS.md

Acceptance matrix for the self-hosted Google Maps reviews collector.
Status column: ✅ = implemented and verified, 🟡 = implemented, untested/partial, ⛔ = not done.

## Hard constraints
| # | Requirement | Status |
|---|---|---|
| C1 | Runs locally on the user's machine (macOS ARM64) | ✅ |
| C2 | No required paid scraping API | ✅ none used |
| C3 | No vendor license server | ✅ |
| C4 | No built-in monthly subscription quota | ✅ (Google's own access limits still apply) |
| C5 | No required paid proxy service | ✅ (optional proxy passthrough is supported) |
| C6 | No mandatory cloud account or telemetry | ✅ nothing leaves the machine but page requests |

## Inputs / outputs
| # | Requirement | Status |
|---|---|---|
| I1 | Accept a Google Maps place/share URL | ✅ |
| I2 | Batch input (one URL per line file, or array) | ✅ |
| O1 | Export CSV | ✅ |
| O2 | Export JSON (versioned schema, `schemaVersion: 1`) | ✅ |

## Collection semantics
| # | Requirement | Status |
|---|---|---|
| S1 | Extract individual reviews (not only counts) | ✅ |
| S2 | Sort modes: default order, newest (also highest/lowest ratings where the UI exposes them) | ✅ newest implemented; others reachable via config but untested 🟡 |
| S3 | Max review count per business | ✅ |
| S4 | Deduplicate reviews | ✅ (dedupe key: `placeId + reviewId`, verified in tests) |
| S5 | Persist jobs; resume interrupted runs | ✅ (checkpoint after each page batch) |
| S6 | Explicit partial/failed run reporting; termination reasons are enum values, not guesses | ✅ |
| S7 | Configurable concurrency/timeouts/retries | ✅ single-worker default (documented assumption: user gave no scale/hardware) |
| S8 | Incremental collection | 🟡 `--incremental` skips businesses already fully collected; reviews are upserted by ID |

## Review fields
Collected when the page presents them; otherwise `null` (never fabricated):
businessName, placeId, listingUrl, reviewId, reviewerName, rating, reviewText,
originalLanguage, translatedByGoogle (bool or null), publishedDateRaw,
publishedDateParsed *(only when a relative/absolute date is defensibly parsed; precision noted)*,
ownerResponse, ownerResponseDateRaw, reviewUrl, collectedAt.
Precision convention: raw strings preserved verbatim; parsed values are either
ISO dates (for absolute dates), or calendar-precision approximations flagged in
`datePrecision` (`month`, `week`, etc.). Unknown → null.

## Safety / quality
| # | Requirement | Status |
|---|---|---|
| Q1 | Consent screens handled via public UI (choose-language/consent page buttons) | ✅ |
| Q2 | On blocker (reCAPTCHA/unusual traffic): stop, classify, save diagnostics, no bypass | ✅ |
| Q3 | Bounded retries with backoff | ✅ |
| Q4 | CSV formula-injection protection | ✅ (leading `=`/`+`/`-`/`@` prefixed with `'`) |
| Q5 | Local-only dashboard binding (127.0.0.1) | ✅ |
| Q6 | Secrets/token redaction in logs and stored diagnostics | ✅ |
| Q7 | Retention/deletion control for stored review data | 🟡 `data delete` + `gc` commands |
| Q8 | Tests (mocked adapter + fixtures) for normalization, dedupe, retries, export, redaction | ✅ |
| Q9 | Live validation on varied businesses | ✅ recorded in VALIDATION.md |
| Q10 | Parity measurement vs. reference product | ⛔ untested — no lawful reference output available; labeled as such everywhere |
