# Google Maps Review Scraper (Reverse / Local-First)

Enterprise-grade, local-first Google Maps review extraction tool built for resilience and anti-bot stealth. Comparable in reliability and anti-detection philosophy to [SeleniumBase UC Mode](https://github.com/seleniumbase/seleniumbase), but native to Node.js and Playwright.

[![Tests](https://img.shields.io/badge/tests-40%20passing-brightgreen)](tests)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-blue)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Highlights

- **Anti-Bot Resilience**: Uses `rebrowser-playwright` CDP runtime leak patches, WebGL vendor/renderer spoofing (`Intel UHD Graphics 630`), Sec-CH-UA fingerprint randomization, and `navigator.webdriver` scrubbing.
- **SeleniumBase-Grade Fault Tolerance**: Exponential backoff with full jitter (`withRetry()`), stall recovery with tab re-engagement, and adaptive scroll throttling based on DOM rendering speed.
- **Authenticated Pagination Support**: Google limits anonymous visitors to ~6 preview reviews before throwing sign-in walls. Run `gmr login` once to store a local persistent profile; all subsequent runs automatically paginate full review histories.
- **Enterprise SQLite Persistence**: Local WAL-mode SQLite store (`data/gmaps-reviews.db`) with composite key `(placeId, reviewId)` UPSERT deduplication, structured job tracking, and run diagnostics.
- **Formula-Injection Safe Exports**: CSV and JSON exporters with automated spreadsheet formula neutralizing (`=`, `+`, `-`, `@` escaped).
- **Graceful Lifecycle Management**: Clean SIGINT/SIGTERM handlers, self-bootstrapping browser checks, and force-kill timeouts to prevent orphaned Chromium processes.

---

## Architecture

```mermaid
flowchart TD
    CLI["CLI (gmr run / login / export)"] --> Runner["Job Runner (SQLite State Tracking)"]
    Runner --> Batch["Batch Collector (Concurrency & Profiles)"]
    Batch --> Stealth["Stealth Engine (UA, WebGL, Jitter)"]
    Batch --> Retry["Retry Engine (Exponential Backoff)"]
    Batch --> Scraper["place-reviews.js (Adaptive Scroll & Recovery)"]
    Scraper --> Store["SQLite Store (Idempotent UPSERT)"]
    Store --> Exporter["Exporters (CSV, JSON)"]
    Store --> Dashboard["Local Dashboard (:7877)"]
```

---

## Quick Start

### 1. Installation

Requires **Node.js >= 22.0.0** (native `node:sqlite`).

```bash
git clone https://github.com/donovinsims/google-maps-review-scraper-reverse.git
cd google-maps-review-scraper-reverse
npm install
```

### 2. (Recommended) Authenticate for Full Pagination

Google Maps limits anonymous unauthenticated visitors to a small preview batch (~6 reviews). To extract 100+ or 1,000+ reviews from a place:

```bash
npx gmr login
```
A Chrome window opens. Sign into any standard Google account. Once signed in, press Enter in the terminal to save your session cookies locally to `data/profiles/default`.

### 3. Run a Collection Job

Collect reviews from a single Google Maps URL:
```bash
npx gmr run "https://www.google.com/maps/place/Tartine+Bakery/@37.761425,-122.424104,17z" --limit 50
```

Collect reviews from a list of URLs in a text file:
```bash
npx gmr run urls.txt --concurrency 2 --limit 100
```

### 4. Check Status & Export

```bash
# View database statistics and recent jobs
npx gmr status

# Export to CSV (escapes formula injection risks)
npx gmr export --format csv --out data/export/reviews.csv

# Export to JSON
npx gmr export --format json --out data/export/reviews.json
```

### 5. Launch Web Dashboard

```bash
npx gmr serve --port 7877
# Open http://localhost:7877 in your browser
```

---

## CLI Reference

```
Usage: gmr [command] [options]

Commands:
  login [options]             Open persistent profile browser to log in to Google Maps
  run [options] <urls...>     Collect reviews for one or more place URLs or a text file
  status                      Print database counts, jobs, and diagnostic summary
  export [options]            Export reviews to CSV or JSON
  delete <placeId>            Delete a place and all its stored reviews
  serve [options]             Launch local analytics dashboard
```

### `gmr run` Options

| Option | Default | Description |
|---|---|---|
| `--concurrency <n>` | `1` | Max concurrent worker tabs (1 to 4) |
| `--limit <n>` | `null` | Max reviews to collect per place (unlimited if omitted) |
| `--sort <mode>` | `default` | Sort order: `default`, `newest`, `highest_rating`, `lowest_rating` |
| `--headless` | `false` | Run headless (defaults to visible browser for anti-bot resilience) |
| `--profile <name>` | `default` | Persistent profile name (`false` to run strictly anonymous) |
| `--proxy <url>` | `null` | Proxy server URL (`http://user:pass@host:port` or `socks5://...`) |
| `--language <lang>` | `en-US` | Locale language code |

---

## Review Record Schema

Each collected review normalized in the SQLite store includes:

| Field | Type | Description |
|---|---|---|
| `reviewId` | string | Unique Google Maps review ID (Primary composite key) |
| `placeId` | string | Normalized place ID (e.g. `ChIJIQBpAG2ahYAR_6128GcTUEo`) |
| `reviewerName` | string | Author public name |
| `reviewerProfileUrl` | string | Link to author Google Maps contribution profile |
| `rating` | integer | Numeric star rating (1 to 5) |
| `reviewText` | string | Review text content (or `null` if rating-only) |
| `publishedDate` | string | Normalized ISO 8601 timestamp (e.g. `2024-03-15T12:00:00Z`) |
| `publishedDateRaw` | string | Raw text as rendered by Google Maps (e.g. `3 weeks ago`) |
| `translatedByGoogle` | boolean | True if translated by Google Translate |
| `ownerResponse` | string | Text response from business owner (or `null`) |
| `ownerResponseDate` | string | ISO timestamp of owner response |
| `collectedAt` | string | ISO timestamp when review was collected |

---

## Reliability & Anti-Detection Architecture

This tool is engineered to resist bot detection and scraping stalls without third-party SaaS dependencies:

1. **CDP Leak Neutralization**: Vanilla Playwright triggers Google's CDP detection via `Runtime.enable`. This project relies on `rebrowser-playwright` which patches internal DevTools instrumentation leaks at the binary/protocol level.
2. **Hardware Fingerprint Emulation**:
   - WebGL renderer/vendor properties are dynamically spoofed to match standard consumer Intel GPUs (`Intel(R) UHD Graphics 630`).
   - Canvas context noise and `navigator.webdriver` removal scripts are injected into every context creation.
3. **Adaptive Scroll Engine**:
   - Instead of static timers, the scroll loop monitors feed throughput. Fast batches speed up scrolling (`0.6x`), while slowing feeds scale up wait times (`1.5x`).
   - If a stall is detected (2 passes with 0 new cards), the engine initiates recovery: re-clicking the Reviews tab and re-centering the feed.
4. **Resilient Failure Lifecycle**:
   - `withRetry()` wraps URL scraping with exponential backoff and jitter. Transient timeouts and socket resets retry automatically; fatal auth walls fail immediately with actionable diagnostic messages.
   - Clean signal traps handle `SIGINT` (Ctrl+C), recording partial batch progress into the SQLite database and gracefully closing browser processes.

---

## Testing

```bash
# Run complete test suite (unit + integration + mocks)
npm test

# Run DOM fixture integration tests
npm run test:integration
```

---

## License

MIT © Donovin Sims
