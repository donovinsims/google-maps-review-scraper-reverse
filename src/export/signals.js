// Review-complaint signals export. Keyword patterns only; every match needs human review.
// explicit = the review states a problem on that topic; indirect = weaker hint, informational only.
// Incomplete jobs are never reported as "no complaints".

const OTHER_BIZ = /\b(?:other|another|different|several|a few|couple(?: of)?|first)\b[^.!?]{0,25}\b(?:places?|compan(?:y|ies)|business(?:es)?|plumbers?|electricians?|contractors?|shops?)\b/i;
const OTHER_PROVIDER = /\b(?:aaa|roadside assistance|insurance company)\b/i;
const THIRD_PARTY_SITE = /\b(?:better business bureau|bbb|yelp|angi|angie'?s list|home ?advisor|nextdoor)\b/i;
const QUALITY_IDIOM = /\b(?:hard|difficult|tough) to find\b[^.!?]{0,5}$|\b(?:quality|service|people|someone|workmanship|honesty|integrity|companies|business(?:es)?|contractors?|shops?|plumbers?|electricians?|good|reliable|trustworthy|honest|great|enough good things)\b[^.!?]{0,40}\b(?:hard|difficult|tough) to find\b|\b(?:hard|difficult|tough) to find (?:a |an )?(?:good|great|quality|reliable|honest|trustworthy|enough|someone|people|companies|contractors?)\b/i;

export const PATTERNS = [
  { topic: 'website', kind: 'explicit', re: /\bweb ?sites?\b|\bweb ?pages?\b|\bcontact form\b/i, exclude: [THIRD_PARTY_SITE, /\bweb ?site\b[^.!?]{0,15}\bon (?:their|the|a|his|her) (?:company )?(?:truck|van|trailer|vehicle|car)s?\b/i] },
  { topic: 'booking', kind: 'explicit', re: /\b(?:could(?:n't| not)|unable to|no way to|hard to|difficult to|impossible to) (?:book|schedule|make an appointment|get an appointment)\b|\bno (?:online )?(?:booking|scheduling)\b|\bonline (?:booking|scheduling)\b|\b(?:moved|changed|cancell?ed|rescheduled) (?:my |the |our )?(?:appointment|time|visit)\b|\bappointment was cancell?ed\b|\bno (?:further )?confirmations?\b|\bcould(?:n't| not) commit\b|\b(?:more|better) (?:informative|communication) (?:on|about) (?:the )?appointment/i, exclude: [OTHER_BIZ] },
  { topic: 'online_ordering', kind: 'explicit', re: /\border(?:ed|ing)? online\b|\bonline order(?:s|ing)?\b|\bordering (?:system|app)\b/i },
  { topic: 'hours', kind: 'explicit', re: /\bhours (?:were|are|was|listed|posted|online|on google)\b[^.!?]{0,30}\b(?:wrong|incorrect|outdated|not accurate|inaccurate|off)\b|\bsaid (?:they|it) (?:was|were) open\b|\bclosed (?:early|when (?:it|they) (?:said|should))\b|\b(?:wrong|incorrect|outdated) hours\b/i },
  { topic: 'hard_to_find', kind: 'explicit', re: /\b(?:hard|difficult|tough) to (?:find|locate)\b(?=[^.!?]{0,25}\b(?:entrance|building|location|address|office|parking|door|sign|driveway|suite|lot)\b)|\b(?:place|it|they|you|location|building|office|shop|store) (?:is|was|are|were) (?:a little |a bit |very |so |really )?(?:hard|difficult|tough) to (?:find|locate)\b|\bcould(?:n't| not) find (?:the|your|their) (?:place|location|building|shop|office|entrance|address|store)\b|\bgps (?:took|sent|led)\b/i, exclude: [QUALITY_IDIOM, /\b(?:hard|difficult|tough) to find (?:a|an|someone|somebody|anyone|people)\b/i, /\b(?:hard|difficult|tough) to find\b[^.!?]{0,30}\bthese days\b/i, /\bfind (?:the )?(?:problem|issue|leak|cause)\b/i] },
  { topic: 'phone_not_answered', kind: 'explicit', re: /\b(?:no ?one|nobody) (?:answer|pick)|\b(?:didn't|did not|never|don't|doesn't|won't|wouldn't) (?:answer|pick up|call(?:ed)? (?:me |us )?back|return(?:ed)? (?:my |our )?(?:calls?|messages?))|\b(?:only got|got|went to|straight to|sent to) (?:a |the |their )?voice ?mail\b|\bleft (?:a |two |three |several |\w+ )?(?:voice ?mails?|messages?)\b[^.!?]{0,60}\b(?:no|never|didn't|did not|without)\b|\b(?:not|never|stopped|without) return(?:ing|ed)? (?:any |my |our |the |a |phone )*calls?\b|\b(?:didn't|did not|don't|won't|wouldn't) return (?:any |my |our |the |a |phone )*calls?\b|\bcalls? (?:were|was|are|got|went) ignored\b|\bnever heard (?:back|from|anything)\b|\b(?:didn't|did not) hear (?:anything )?back\b|\b(?:never got|didn't get|did not get|without) (?:a |any )?(?:call ?back|response|reply)\b|\bno (?:call ?back|response|reply)\b|\bnever (?:give|gave) (?:me |us )?(?:a )?call ?back\b|\bnever (?:received|got) (?:a |the |my |our |any )?(?:quote|estimate|one)\b|\bunanswered\b(?! questions)|\bno call ?back\b/i, exclude: [OTHER_BIZ, OTHER_PROVIDER], wide: true },
  { topic: 'online_contact', kind: 'explicit', re: /\b(?:submitted|filled out|sent|requested)\b[^.!?]{0,40}\b(?:online|form|request|quote)\b[^.!?]{0,60}\b(?:no (?:response|reply)|never heard|nothing)\b|\bemail(?:ed)?\b[^.!?]{0,40}\b(?:no (?:response|reply)|never heard|never got)\b|\bwould email\b.{0,80}?\bnever\b/i, exclude: [OTHER_BIZ] },
  // indirect: weaker hints that a customer struggled to reach, book or get information
  { topic: 'couldnt_find_info', kind: 'indirect', re: /\bcould(?:n't| not)(?: even)? find (?:a |any |their |your |the )?(?:phone|number|website|hours|info(?:rmation)?|prices?|pricing|email|way to contact)\b|\bcould(?:n't| not) find (?:them|it|you) online\b/i },
  { topic: 'called_no_answer', kind: 'indirect', re: /\bcalled\b[^.!?]{0,40}\b(?:no answer|nobody|no one|voicemail|no response|went unanswered)\b/i, exclude: [OTHER_BIZ] },
  { topic: 'no_show', kind: 'indirect', re: /\b(?:never|didn't|did not) show(?:ed)?(?: up\b|(?= or\b|[.,!;]))|\bno[- ]show\b/i, exclude: [OTHER_BIZ, OTHER_PROVIDER, /\b(?:we|i|you) (?:didn't|did not|never) show/i], wide: true },
  { topic: 'had_to_call', kind: 'indirect', re: /\bhad to (?:call|keep calling|call back|call again|follow up|reach out)\b|\bcall and call\b/i, exclude: [OTHER_BIZ, /\bhad to call (?:\w+ )?out\b/i] },
  { topic: 'no_way_to_book', kind: 'indirect', re: /\bno way to (?:book|schedule|order|contact|reach|email)\b/i },
  { topic: 'wish_they_had', kind: 'indirect', re: /\bwish (?:they|you|he|she) (?:had|offered|would (?:add|have))\b/i },
  { topic: 'facebook_only', kind: 'indirect', re: /\bonly (?:on|through|via) facebook\b|\bfacebook (?:only|page only)\b|\b(?:no|doesn't have a|don't have a) website\b/i },
  { topic: 'outdated_info', kind: 'indirect', re: /\b(?:outdated|out of date|wrong|incorrect|old) (?:info(?:rmation)?|phone(?: number)?|number|address|website|prices?|listing)\b|\bupdate (?:your|their) (?:google|business|listing|page|website|hours|info)\b|\bgoogle (?:business )?(?:page|listing|profile) (?:says|states|shows|lists|is wrong)\b/i },
];
export const TOPICS = Object.fromEntries(PATTERNS.map((p) => [p.topic, p.re]));
const RESPONSIVE_PRAISE = /\b(?:responsive|respond(?:ed|s)? (?:quickly|fast|promptly|right away)|quick (?:to respond|response|reply)|called (?:me |us )?back|returned (?:my|our) call|answered (?:the|my|our) (?:phone|call)|got back to (?:me|us)|same[- ]day)\b/i;
export const RESPONSIVENESS_MIN_REVIEWS = 20;

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

function sentenceAt(text, idx) {
  const before = text.slice(0, idx); const s = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?')) + 1;
  const m = /[.!?]/.exec(text.slice(idx)); const e = m ? idx + m.index + 1 : text.length;
  return text.slice(s, e);
}

// sentence containing idx plus up to two sentences before it (for other-company mentions)
function contextAt(text, idx) {
  const s = sentenceAt(text, idx); const start = text.indexOf(s, Math.max(0, idx - s.length));
  const prev = text.slice(0, start).split(/(?<=[.!?])\s+/).filter(Boolean).slice(-2).join(' ');
  return prev + ' ' + s;
}

export function matchReview(r) {
  const text = (r.reviewText ?? '').replace(/[\u2018\u2019]/g, "'");
  const out = [];
  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, 'gi'); let m; let hit = null;
    while ((m = re.exec(text))) {
      const sentence = p.wide ? contextAt(text, m.index) : sentenceAt(text, m.index);
      if (!(p.exclude ?? []).some((x) => x.test(sentence))) { hit = m; break; }
    }
    if (hit) out.push({ topic: p.topic, kind: p.kind, reviewId: r.reviewId, date: r.publishedDateParsed ?? r.publishedDateRaw ?? null,
      dateRaw: r.publishedDateRaw ?? null, rating: r.rating ?? null, quote: quoteAround(text, hit.index, hit[0].length) });
  }
  return out;
}

export function strength(status, matches, businessSignals) {
  if (status !== 'complete') return 'incomplete';
  if (matches.some((m) => m.kind === 'explicit' && (m.rating == null || m.rating <= 3))) return 'strong';
  if (matches.length || businessSignals.length) return 'weak';
  return 'none-found';
}

// items: [{placeId,inputUrl,status,termination,name}], reviewsByPlace: Map placeId -> rows
export function buildSignals(items, reviewsByPlace, { generatedAt = new Date().toISOString() } = {}) {
  const businesses = items.map((it) => {
    const reviews = (it.placeId && reviewsByPlace.get(it.placeId)) || [];
    const status = jobStatus(it, reviews);
    const matches = reviews.flatMap(matchReview);
    const byTopic = Object.fromEntries(PATTERNS.map((p) => [p.topic, matches.filter((m) => m.topic === p.topic).length]));
    const businessSignals = [];
    if (status === 'complete' && reviews.length >= RESPONSIVENESS_MIN_REVIEWS && !reviews.some((r) => RESPONSIVE_PRAISE.test(r.reviewText ?? ''))) {
      businessSignals.push({ topic: 'no_responsiveness_praise', kind: 'indirect', detail: `none of ${reviews.length} scanned reviews praise responsiveness (calls answered or returned)` });
    }
    let termination = null;
    try { termination = JSON.parse(it.termination ?? 'null'); } catch { termination = null; }
    const st = strength(status, matches, businessSignals);
    return {
      placeId: it.placeId ?? null, name: it.name ?? null, inputUrl: it.inputUrl, jobStatus: status,
      termination: termination?.reason ?? null, reviewsScanned: reviews.length, strength: st,
      matchCounts: byTopic, matches, businessSignals,
      complaintSummary: status === 'complete'
        ? (matches.length ? 'keyword matches found; human review required' : 'no keyword matches in scanned reviews')
        : 'incomplete: results do not establish absence of complaints',
    };
  });
  return { schema: 'gmr-signals/2', generatedAt,
    method: 'keyword match on review text; explicit = stated problem, indirect = weaker hint; every match requires human review; informational only',
    topics: PATTERNS.map((p) => ({ topic: p.topic, kind: p.kind })), businesses };
}

export function signalsFromDb(db, { jobId } = {}) {
  const job = jobId ?? db.prepare('SELECT id FROM jobs ORDER BY createdAt DESC LIMIT 1').get()?.id;
  const items = db.prepare(`SELECT ji.placeId, ji.inputUrl, ji.status, ji.termination, b.name FROM job_items ji
    LEFT JOIN businesses b ON b.placeId = ji.placeId WHERE ji.jobId = ? ORDER BY ji.idx`).all(job);
  const map = new Map();
  for (const it of items) if (it.placeId) map.set(it.placeId, db.prepare('SELECT * FROM reviews WHERE placeId = ?').all(it.placeId));
  return { jobId: job ?? null, ...buildSignals(items, map) };
}
