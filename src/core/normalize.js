// Normalization & validation: one place where raw extracted fields become
// typed records. Missing things stay null — nothing is fabricated.
export function normalizeReview(raw, ctx = {}) {
  const rating = normalizeRating(raw?.ratingRaw ?? raw?.rating);
  const isStr = (v) => (typeof v === 'string' && v.length > 0 ? v : null);
  const rec = {
    reviewId: isStr(raw?.reviewId),
    placeId: isStr(raw?.placeId) ?? isStr(ctx.placeId),
    reviewerName: isStr(raw?.reviewerName),
    reviewerProfileUrl: isStr(raw?.reviewerProfileUrl),
    rating: rating.rating,
    ratingRaw: rating.ratingRaw,
    reviewText: isStr(raw?.reviewText),
    textTruncated: boolOrNull(raw?.textTruncated),
    originalLanguage: isStr(raw?.originalLanguage),
    translatedByGoogle: boolOrNull(raw?.translatedByGoogle),
    publishedDateRaw: isStr(raw?.publishedDateRaw),
    publishedDateParsed: raw?.publishedDateParsed ?? null,
    datePrecision: raw?.datePrecision ?? null,
    ownerResponse: isStr(raw?.ownerResponse),
    ownerResponseDateRaw: isStr(raw?.ownerResponseDateRaw),
    ownerResponseDateParsed: raw?.ownerResponseDateParsed ?? null,
    ownerResponseDatePrecision: raw?.ownerResponseDatePrecision ?? null,
    reviewUrl: isStr(raw?.reviewUrl),
    ...(ctx.runId ? { runId: ctx.runId } : {}),
    ...(ctx.listingUrl ? { listingUrl: ctx.listingUrl } : {}),
  };
  return { record: rec, warnings: [] };
}

export function normalizeRating(value) {
  if (value == null) return { rating: null, ratingRaw: null };
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5)
    return { rating: value, ratingRaw: String(value) };
  if (typeof value === 'string') {
    const m = value.match(/(\d)/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 5) return { rating: Number(m[1]), ratingRaw: value };
  }
  return { rating: null, ratingRaw: typeof value === 'string' ? value : String(value) };
}

export function boolOrNull(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}
