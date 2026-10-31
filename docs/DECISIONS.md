# Decisions

- 2026-10-30: Date estimates use the midpoint of intersected observation windows. Midpoints may move in either direction as uncertainty narrows (approved by owner).
- 2026-10-30: Keep Express 4, use linkedom for real-DOM offline fixtures, and remove identity spoofing rather than retain an optional spoof mode.
- 2026-10-30: Aggregate the complete persisted job during resume, including already terminal items; a fully completed resume is idempotent.
- 2026-10-30: Failed > blocked > partial > completed determines aggregate status/exit; interruption is 130 and usage errors are 64. A circuit break exits 3 unless an earlier failed item takes precedence.

- 2026-10-30: Live search-list footers are not review exhaustion evidence. End markers must belong to the review feed, exclude review bodies, and cannot establish successful zero-review collection without separate positive zero evidence.
- 2026-10-30: Anonymous Google access exposed zero review cards in actual runs; the historical ~6-card assumption is not a guarantee. Limited-view classification still needs follow-up.
- 2026-10-30: Paused at owner request after 100 passing tests; no signed-in collection or full live release gate has passed.
