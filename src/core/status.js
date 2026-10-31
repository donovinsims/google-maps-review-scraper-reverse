// Pure mapping from a place result to a job item status (F2: honest completeness).
export const COMPLETENESS_TOLERANCE = 0.98; // Google's count can include hidden reviews; calibrate live.

export function classifyItem(result) {
  const reason = result?.termination?.reason;
  const collected = result?.reviews?.length ?? 0;
  const expected = result?.place?.reviewsCount ?? null;
  if (reason === 'skipped-incremental') return 'skipped';
  if (reason === 'interrupted') return 'interrupted';
  if (reason === 'limit-reached') return 'done';
  if (reason === 'no-more-reviews') {
    return expected != null && collected >= Math.floor(expected * COMPLETENESS_TOLERANCE) ? 'done' : 'partial';
  }
  if (['blocked', 'captcha', 'sign-in-wall', 'limited-view'].includes(reason)) return 'blocked';
  if (['failed', 'missing-place-id', 'search-mismatch', 'structure-unknown', 'sort-unavailable', 'place-mismatch', 'db-error'].includes(reason) || result?.error) return 'failed';
  if (['anonymous-preview-limit', 'timeout', 'pagination-stall', 'sign-in-required'].includes(reason)) return 'partial';
  return collected ? 'partial' : 'failed';
}
