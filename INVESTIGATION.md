# INVESTIGATION.md

Evidence log for the replacement Google Maps reviews collector.
Investigation date: **2026-10-30** (all URLs checked on this date).

## 1. Reference repository: `omkarcloud/google-maps-reviews-scraper`

| Item | Evidence |
|---|---|
| Commit inspected | `7306057a772a51fce2ed08faaf009bc6961249f1` ("fixes", 2026-04-10), branch `master` |
| Repo contents | `README.md` (39,858 B), `fields.md`, `LICENSE`, `SECURITY.md`, `.gitignore`, `.github/`, `.DS_Store` |
| License | MIT (Copyright (c) 2023–2024 Chetan Jain) — verified by reading raw LICENSE |
| Scraper implementation in repo | **None.** No source, scripts, or build system. The repo is documentation/marketing for a compiled desktop application. |

### Advertised capabilities (from README, claims only)
- Desktop app "Google Maps Extractor" (Mac/Windows/RPM/DEB) built on **Botasaurus**, the vendor's open-source scraping framework.
- "200 searches free every month" — i.e. a vendor-imposed monthly quota on the free tier; a one-time purchase unlocks lifetime searches.
- Reviews extraction: max-reviews-per-place limit, sort = Newest / Most Relevant / Highest Rating / Lowest Rating, keyword search inside reviews, language selection with `original_language` + `review_translated_text`.
- Data model documented in `fields.md`: per place `RATING`, `REVIEWS`, `REVIEWS_LINK`, `REVIEWS_PER_RATING`, `DETAILED_REVIEWS`, `REVIEW_KEYWORDS`, etc. (field *names* documented; field payload schema is not published).
- Export: CSV / JSON / Excel from the results UI.
- "50+ data points" including enrichment (emails, socials) — enrichment is **paid by credit** (1 credit = 1 cent) through the vendor's cloud API.

### Claims vs. established facts
- The repository itself establishes only what is written above. Nothing in the repo proves how extraction is performed.
- Extraction engine = Botasaurus, which is open source; the compiled app is a wrapper. The vendor's marketing says free quota is enforced, which implies at least one vendor-side control even on the free tier.
- **The distributed app was not analyzed** (no binary, no authorization to instrument it). Local/remoteness is therefore formally *unknown*, but irrelevant to our design because we build an independent collector from observable public behavior.

### Reverse-engineering tools: what each could answer, and the decision
| Tool | Question it could answer | Decision |
|---|---|---|
| `reverse-skill` | Generic mobile/binary app analysis | Not applicable — no artifact analyzed, no question requires it |
| `cyberkaida/reverse-engineering-assistant` (ReVa) | Ghidra-driven analysis of the desktop binary | Not applicable; decompiling a compiled Electron/Botasaurus wrapper would answer little — the extraction engine (Botasaurus) is already public |
| `GhidraMCP` | Native binary analysis | Same as above — building from the public engine and independently observed page behavior is cleaner than reverse-engineering an off-the-shelf wrapper |
| `mitmproxy` | Whether the vendor app's extraction calls its own cloud or runs locally | Only relevant if the user later owns a copy and grants authorization. This is a documentation-only question, not an implementation question, because we never reuse vendor infrastructure |

**Conclusion:** binary RE adds nothing to a clean-room build. All four tools rejected; effort redirected to building from observable behavior of the public `google.com/maps` review UI (see VALIDATION.md for those live observations).

### License-compatibility note
The reference repo is MIT, but contains no implementation to adapt, so no code is derived from it. `fields.md` was used as a checklist vocabulary only (plain data-box names, no copyrightable expression of the program itself).

## 2. Existing open-source collectors evaluated (time-boxed)

| Project | License | Collection code present | Reviews capability | Paid-service dependence | Verdict |
|---|---|---|---|---|---|
| `omkarcloud/google-maps-scraper` | MIT (API coverage 200 searches/mo quota is enforced by vendor free tier) | Yes (Python, Botasaurus) | Reviews per place via Botasaurus drive | Vendor free-tier quota; enrichment is paid credits | Not our fork; Botasaurus flow confirms reviews are extractable via the place page UI |
| `gosom/google-maps-scraper` | MIT | Yes (Go + Playwright) | Reviews are an "extra" (`-extra-reviews`) on search-result places, not the primary path; screenshot literature shows review caps and proxy push | Optional but heavy sponsorship pressure toward paid proxies; requires Docker | Not review-centric; rejected as a base, kept as prior art on Playwright-vs-Maps practicalities |
| `omkarcloud/botasaurus` | MIT | Yes (Python) | The engine the commercial app runs on | None at library level | Confirms "all reviews" extraction is a browser-automation problem, not an API problem |
| Commercial paid-API scrapers (Apify/HasData/etc.) | proprietary | No | n/a | Required by design | Excluded by requirement (no paid API) |

## 3. Decision
**Build an independent collector.** Rationale:
1. Reference repo has nothing to adapt.
2. Go/Python alternatives are search-result-centric; our requirement is review-centric extraction from a business place URL with field-level completeness.
3. Node + Playwright runs natively on the user's machine (macOS ARM64, Node v26.7.0) with no Docker.
4. Published behavior of the Google Maps place page (reviews tab, sort buttons, "More reviews" pagination, expandable text, `data-review-id` attributes) is observable and testable — see VALIDATION.md live runs.
