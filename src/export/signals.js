// Review-complaint signals export (pilot, option B). Keyword matching only; every match
// needs human review. Incomplete jobs are never reported as "no complaints".
export const TOPICS = {
  website: /\bweb ?sites?\b|\bweb ?pages?\b/i,
  booking: /\bappointments?\b|\bbook(?:ed|ing)? (?:online|an? )|\bschedul(?:e|ed|ing) (?:online|an?|a time)\b|\bbooking\b/i,
  online_ordering: /\border(?:ed|ing)? online\b|\bonline order(?:s|ing)?\b|\bordering (?:system|app)\b/i,
  hours: /\b(?:business|posted|listed|open(?:ing)?|store) hours\b|\bhours (?:on|online|listed|posted|said|were wrong)\b|\bsaid (?:they|it) (?:was|were) open\b|\bclosed (?:early|during)\b/i,
  hard_to_find: /\b(?:hard|difficult|tough) to (?:find|locate)\b|\bcould(?:n't| not) find (?:the|your|their|it|them|this)\b|\bgps\b/i,
  phone_not_answered: /\b(?:no ?one|nobody) (?:answer|pick)|\b(?:didn't|did not|never|don't|doesn't|won't|wouldn't) (?:answer|pick up|call(?:ed)? (?:me )?back|return(?:ed)? (?:my )?(?:call|message))|\bvoice ?mail\b|\bunanswered\b|\bno call ?back\b/i,
};

const COMPLETE = new Set(['limit-reached', 'no-more-reviews', 'no-reviews']);

export function jobStatus(item, reviews) {
  if (item?.status === 'partial') return 'partial';
  if (!item || item.status !== 'done') return 'failed';
  let reason = null;
  try { reason = JSON.parse(item.termination ?? 'null')?.reason ?? null; } catch { reason = null; }
  if (!COMPLETE.has(reason)) return 'partial';
  if (reviews.some((r) => r.textTruncated === 1)) return 'partial';
  return 'complete';
}

export function quoteAround(text, idx, len, max = 240) {
  const start = Math.max(0, text.lastIndexOf('.', idx) + 1, idx - max / 2);
  const end = Math.min(text.length, idx + len + max / 2);
  return (start > 0 ? '...' : '') + text.slice(start, end).trim() + (end < text.length ? '...' : '');
}

export function matchReview(r) {
  const text = r.reviewText ?? '';
  const out = [];
  for (const [topic, re] of Object.entries(TOPICS)) {
    const m = re.exec(text);
    if (m) out.push({ topic, reviewId: r.reviewId, date: r.publishedDateParsed ?? r.publishedDateRaw ?? null,
      dateRaw: r.publishedDateRaw ?? null, rating: r.rating ?? null, quote: quoteAround(text, m.index, m[0].length) });
  }
  return out;
}

// items: [{placeId,inputUrl,status,termination,name}], reviewsByPlace: Map placeId -> rows
export function buildSignals(items, reviewsByPlace, { generatedAt = new Date().toISOString() } = {}) {
  const businesses = items.map((it) => {
    const reviews = (it.placeId && reviewsByPlace.get(it.placeId)) || [];
    const status = jobStatus(it, reviews);
    const matches = reviews.flatMap(matchReview);
    const byTopic = Object.fromEntries(Object.keys(TOPICS).map((t) => [t, matches.filter((m) => m.topic === t).length]));
    let termination = null;
    try { termination = JSON.parse(it.termination ?? 'null'); } catch { termination = null; }
    return {
      placeId: it.placeId ?? null, name: it.name ?? null, inputUrl: it.inputUrl, jobStatus: status,
      termination: termination?.reason ?? null, reviewsScanned: reviews.length, matchCounts: byTopic, matches,
      complaintSummary: status === 'complete'
        ? (matches.length ? 'keyword matches found; human review required' : 'no keyword matches in scanned reviews')
        : 'incomplete: results do not establish absence of complaints',
    };
  });
  return { generatedAt, method: 'keyword match on review text; every match requires human review', topics: Object.keys(TOPICS), businesses };
}

export function signalsFromDb(db, { jobId } = {}) {
  const job = jobId ?? db.prepare('SELECT id FROM jobs ORDER BY createdAt DESC LIMIT 1').get()?.id;
  const items = db.prepare(`SELECT ji.placeId, ji.inputUrl, ji.status, ji.termination, b.name FROM job_items ji
    LEFT JOIN businesses b ON b.placeId = ji.placeId WHERE ji.jobId = ? ORDER BY ji.idx`).all(job);
  const map = new Map();
  for (const it of items) if (it.placeId) map.set(it.placeId, db.prepare('SELECT * FROM reviews WHERE placeId = ?').all(it.placeId));
  return { jobId: job ?? null, ...buildSignals(items, map) };
}
