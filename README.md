# Google Maps Review Scraper (Reverse / Local-First)

Local-first Google Maps review extraction tool built for data accuracy, honest reporting, and repeatable results. Runs directly on your machine with native Node.js and Playwright.

[![Node](https://img.shields.io/badge/node-%3E%3D22.13.0-blue)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Priorities

1. **Accurate data**: Verified selectors, real-DOM parsing, strict star rating validation, clean owner response separation, and uncertainty-bounded date windows that never drift.
2. **Honest reporting**: Never reports success when a run is blocked, truncated, or incomplete. Specific typed termination reasons and semantic exit codes.
3. **Repeatable results**: Re-observation intersects date uncertainty windows to narrow time bounds rather than advancing relative dates.
4. **Clear failure messages**: Actionable diagnostics, automatic masked screenshots, and redacted HTML captures on non-success outcomes.

---

## System Requirements

- **Node.js >= 22.13.0** (required for built-in `node:sqlite` `DatabaseSync`)
- **Google Chrome** installed locally (falls back to Playwright's bundled Chromium if unavailable)
- macOS, Linux, or Windows (tested on macOS arm64)

---

## Quick Start

### 1. Installation

```bash
git clone https://github.com/donovinsims/google-maps-review-scraper-reverse.git
cd google-maps-review-scraper-reverse
npm install
```

Verify your environment with `doctor`:

```bash
npm run cli -- doctor
```

### 2. Authentication (Recommended)

Google restricts unauthenticated access to Google Maps. Anonymous visitors often receive a limited place overview with zero review cards or a small preview batch before hitting sign-in walls.

To extract complete review histories:

```bash
npm run cli -- login
```

A visible Chrome window will open. Sign into your Google account. Once signed in, press Enter in the terminal (or close the browser window) to save your session profile to `data/profiles/default`.

Run `doctor` again to confirm signed-in status:

```bash
npm run cli -- doctor
```

### 3. Run a Collection Job

Collect reviews for a place using its settled URL or feature ID:

```bash
npm run cli -- run "https://www.google.com/maps/place/Tartine+Bakery/data=!4m2!3m1!1s0x808f7e1807365605:0x601f7a97f0ce6c6b" --limit 30
```

Collect from a list of URLs in a text file (one URL per line):

```bash
npm run cli -- run urls.txt --concurrency 1 --limit 100
```

Resume an interrupted job:

```bash
npm run cli -- run --resume <jobId>
```

### 4. Inspect & Export

```bash
# View database statistics, collected places, and recent jobs
npm run cli -- status

# Export to CSV (with formula injection defense and UTF-8 BOM)
npm run cli -- export --format csv --out data/export/reviews.csv

# Export to JSON (schema version 2)
npm run cli -- export --format json --out data/export/reviews.json

# Delete a place and its reviews
npm run cli -- delete "0x808f7e1807365605:0x601f7a97f0ce6c6b"

# Vacuum database and clean up older jobs
npm run cli -- gc --older-than 30
```

### 5. Web Dashboard

```bash
npm run cli -- serve --port 7877
# Open http://localhost:7877
```

---

## CLI Reference

Run via `npm run cli -- <command> [options]` or link globally with `npm link` and run `gmr <command> [options]`.

### Commands

| Command | Description |
|---|---|
| `login [options]` | Open persistent profile browser to log in to Google Maps |
| `doctor [options]` | Check Node version, SQLite, DB permissions, browser, and auth state |
| `run [options] <urls...>` | Collect reviews for one or more place URLs or a text file |
| `status` | Print database counts, collected places, and recent jobs summary |
| `export [options]` | Export collected reviews to CSV or JSON |
| `delete <placeId>` | Delete a place and all its stored reviews (positional ID or `--placeId`) |
| `gc [options]` | Clean up old jobs and vacuum database (`--older-than <days>`) |
| `serve [options]` | Launch local dashboard bound strictly to localhost (`--port <port>`) |

### `run` Options

| Option | Default | Description |
|---|---|---|
| `--limit <n>` | `null` | Max reviews to collect per place (positive integer, unlimited if omitted) |
| `--concurrency <n>` | `1` | Concurrent worker tabs (1 to 4). Persistent profiles default to 1. |
| `--unsafe-concurrency` | `false` | Allow concurrency > 1 with a persistent profile |
| `--sort <mode>` | `default` | Sort order: `default`, `newest`, `relevant`, `highest`, `lowest` |
| `--headless` | `false` | Run headless browser |
| `--profile <name>` | `default` | Persistent profile name (`--no-profile` or `--profile false` for anonymous) |
| `--require-login` | `false` | Abort immediately (exit 64) if the profile is not signed in |
| `--language <lang>` | `en` | UI language / `hl` parameter (`^[a-z]{2}(-[A-Z]{2})?$`) |
| `--region <reg>` | `us` | Region / `gl` parameter |
| `--proxy <url>` | `null` | Proxy server URL (`http://user:pass@host:port`). Credentials redacted in storage. |
| `--incremental` | `false` | Skip places previously completed within the retention window |
| `--incremental-days <n>` | `7` | Days before an incremental place is eligible for re-collection |
| `--resume <jobId>` | `null` | Resume unfinished items from an earlier job (preserves original indices) |
| `--min-completeness <n>` | `0.9` | Ratio of collected to expected reviews required for `completed` status |
| `--stall-timeout-sec <n>` | `90` | Seconds without new reviews before classifying a stall |
| `--place-timeout-min <n>` | `60` | Hard ceiling minutes per place |
| `--delay-ms <min,max>` | `3000,8000` | Random delay between consecutive places in milliseconds |
| `--db <path>` | `data/gmaps-reviews.db` | SQLite database file path |

### Exit Codes

| Code | Status | Meaning |
|---|---|---|
| `0` | `completed` | All items finished successfully (`done` or `skipped`) |
| `1` | `failed` | One or more items failed (unrecoverable error, invalid URL, sort failure) |
| `2` | `partial` | Incomplete yield, anonymous preview limit, timeout, or structure drift |
| `3` | `blocked` | Circuit breaker tripped by bot wall, CAPTCHA, or consent wall |
| `64` | `usage` | Invalid CLI options or argument validation failure |
| `130` | `interrupted` | Aborted cleanly by SIGINT / SIGTERM |

---

## Terminations & Item Status

Every processed place produces a structured summary with a typed termination reason:

| Status | Termination Reasons | Description |
|---|---|---|
| `done` | `limit-reached`<br>`no-more-reviews`<br>`no-reviews` | Reached requested limit, exhausted feed with positive end marker, or confirmed zero reviews |
| `skipped` | `skipped-incremental` | Place was previously completed within `--incremental-days` |
| `partial` | `incomplete`<br>`anonymous-preview-limit`<br>`pagination-stall`<br>`timeout`<br>`sign-in-required`<br>`structure-drift` | Truncated reviews remain, yield was below `--min-completeness`, hit anonymous access cap, or feed stalled |
| `blocked` | `blocked`<br>`captcha`<br>`sign-in-wall`<br>`consent-wall` | Access denied or anti-bot challenge presented. 2 consecutive blocks trigger circuit breaker. |
| `failed` | `missing-place-id`<br>`search-mismatch`<br>`structure-unknown`<br>`invalid-url`<br>`sort-failed`<br>`persistence-error`<br>`failed` | Fatal operational failure, unresolvable place ID, or unrecognized page markup |

---

## Database Schema (Schema v2)

Stored in SQLite via `DatabaseSync` in WAL mode with foreign keys enabled.

### `reviews` Table

| Column | Type | Description |
|---|---|---|
| `reviewId` | TEXT PRIMARY KEY | Review identifier from `data-review-id` |
| `placeId` | TEXT NOT NULL | Internal feature ID (`0x...:0x...`) |
| `reviewerName` | TEXT | Author display name (or null) |
| `reviewerProfileUrl` | TEXT | Link to author Contributions profile |
| `rating` | INTEGER | Validated 1-5 star rating |
| `ratingRaw` | TEXT | Raw rating text (e.g., "5 stars") |
| `reviewText` | TEXT | Full text, cleaned of "More" buttons and owner reply text |
| `textTruncated` | INTEGER | `1` if review ends in an unresolved truncation marker (`…`) |
| `originalLanguage` | TEXT | Detected language code |
| `translatedByGoogle` | INTEGER | `1` if translated, `0` if not |
| `publishedDateRaw` | TEXT | Raw relative or absolute date string |
| `publishedDateParsed` | TEXT | Estimated ISO 8601 UTC timestamp (window midpoint) |
| `publishedDateEarliest` | TEXT | Earliest bound of the uncertainty window (ISO UTC) |
| `publishedDateLatest` | TEXT | Latest bound of the uncertainty window (ISO UTC) |
| `datePrecision` | TEXT | `minute`, `hour`, `day`, `week`, `month`, `year` |
| `isEdited` | INTEGER | `1` if review was edited |
| `ownerResponse` | TEXT | Separate owner response text |
| `ownerResponseDateRaw` | TEXT | Raw owner response date string |
| `ownerResponseDateParsed` | TEXT | Estimated ISO UTC timestamp for owner response |
| `ownerResponseDateEarliest`| TEXT | Earliest bound for owner response |
| `ownerResponseDateLatest`  | TEXT | Latest bound for owner response |
| `reviewUrl` | TEXT | Canonical direct link to the specific review |
| `listingUrl` | TEXT NOT NULL | URL used to collect the review |
| `feedRank` | INTEGER | 1-based order of appearance in the review feed |
| `runId` | TEXT | Job ID that collected this record |
| `collectedAt` | TEXT | First collection ISO timestamp |
| `updatedAt` | TEXT | Last update ISO timestamp |

---

## Key Technical Details

### Feature IDs vs. Places API IDs
Google Maps URLs use a hex feature ID pair (e.g. `0x808f7e1807365605:0x601f7a97f0ce6c6b`), not the 27-character base64 Place ID used by Google Places API (`ChIJ...`). This scraper resolves and stores the internal feature ID.

### Date Uncertainty Windows
Relative dates like "3 months ago" do not represent a single point in time. They describe a window: `[now - 4 months, now - 3 months]`. We store:
- `publishedDateEarliest`: earliest possible timestamp
- `publishedDateLatest`: latest possible timestamp
- `publishedDateParsed`: midpoint estimate

When a place is re-collected months later, observation windows **intersect** (`earliest = max(e1, e2)`, `latest = min(l1, l2)`). This narrows uncertainty rather than allowing dates to artificially drift forward.

### Truncation Defense
Reviews with long text display a "More" button. The collector expands all collapsed cards in a batch, verifies DOM settlement, and inspects cards post-expansion. If any card still terminates in `…`, it is flagged with `textTruncated = 1` and prevents a false `done` status.

### Formula Injection Protection
CSV exports automatically neutralize spreadsheet formula execution risks by escaping leading `= + - @ \t \r` characters. Disable with `--raw-csv` if raw output is required. JSON exports are schema-versioned and unescaped.

---

## Known Limitations

1. **Anonymous Access Caps**: Unauthenticated Google Maps sessions may return zero review cards or a small preview batch. Full-history extraction requires an authenticated profile via `npm run cli -- login`.
2. **Selector Drift**: Google Maps periodically changes its obfuscated DOM class names. The selector engine prioritizes stable ARIA roles and attributes with class fallbacks. When field coverage drops below 90%, it triggers `structure-drift` with full diagnostics.
3. **Advertised vs. Actual Reviews**: Google's displayed review count includes rating-only submissions that do not generate review cards in the feed. The `--min-completeness` threshold (default 90%) accounts for this variance.
4. **Edited Reviews**: A review marked "Edited" reflects the timestamp of the last edit, not the original post date.

---

## Legal & Compliance Notice

This tool is intended for research, personal data backup, and legitimate auditing purposes. Automated querying of Google Maps may violate Google's Terms of Service. Use at your own risk. When using a signed-in Google account, heavy automated scraping may put the account at risk of temporary or permanent access restrictions.

---

## License

MIT © Donovin Sims
