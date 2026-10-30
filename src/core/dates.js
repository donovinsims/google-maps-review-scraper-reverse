// Date parsing with defensible precision.
// Google Maps shows review dates as absolute ("Sep 12, 2023") or relative
// ("2 weeks ago", "a month ago", "a year ago") depending on listing language.
// We parse to ISO only when the string maps to a defensible calendar window.

const UNIT_MS = {
  minute: 60_000, hour: 3_600_000, day: 86_400_000,
  week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000,
};

const DEFAULT_LOCALE_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
];

function monthIndexFromName(name, months = null) {
  const norm = (x) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const p = norm(name).slice(0, 3);
  if (months && typeof months === 'object' && !Array.isArray(months)) {
    // locale table given as {monthName: 0-based index}
    for (const [key, idx] of Object.entries(months)) {
      if (norm(key).startsWith(p)) return idx;
    }
    return -1;
  }
  const arr = months ?? DEFAULT_LOCALE_MONTHS;
  for (let i = 0; i < arr.length; i++) {
    if (norm(arr[i]).startsWith(p)) return i;
  }
  return -1;
}

/**
 * Parse a published-date string as shown by Google Maps.
 * @param {string|null} raw
 * @param {number|null} nowMs reference "now" (ms) for relative dates; defaults to Date.now()
 * @param {Record<string,number>} months month-name → 0-based index for non-English locales
 * @returns {null | {iso: string, precision: 'day'|'week'|'month'|'year', relative: boolean}}
 */
export function prsToDate(raw, nowMs = null, months = null) {
  if (raw == null) return null;
  const now = nowMs ?? Date.now();
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw > 1e14 ? Math.floor(raw / 1000) : (raw < 1e11 ? raw * 1000 : raw);
    return { iso: new Date(ms).toISOString(), precision: 'minute', relative: false };
  }
  const s = String(raw).trim().toLowerCase().replace(/\u00a0/g, ' ');
  if (!s) return null;

  // Unix epoch string (seconds or ms or microseconds)
  if (/^\d{10,16}$/.test(s)) {
    const num = Number(s);
    const ms = num > 1e14 ? Math.floor(num / 1000) : (num < 1e11 ? num * 1000 : num);
    return { iso: new Date(ms).toISOString(), precision: 'minute', relative: false };
  }

  // Relative: "a|2|12 ... minutes|hours|days|weeks|months|years ago"
  const stem = s.replace(/^(?:about |just |almost |edited |edited\s+\w+\s+)+/u, '');
  const rel = /^(?:a|an|(?:(\d{1,3}))|(\d{1,3}))\s*(min(?:ute)?s?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\s*(?:ago)?$/i
    .exec(stem)
    ?? /^(\d{1,3})\s*(min(?:ute)?s?|mins?|hours?|hrs?|days?|weeks?|months?|years?)$/i.exec(stem);
  if (rel) {
    let n = rel[1] ?? rel[2];
    if (n == null || n === '' || /^(a|an)$/i.test(n)) n = 1;
    n = Number(n);
    const unit = rel[3] ? Object.entries(UNIT_MS)
      .find(([k]) => rel[3].toLowerCase().startsWith(k.slice(0, 4)))?.[1] : null;
    if (!unit) return null;
    const ms = now - n * unit;
    if (!Number.isFinite(ms)) return null;
    const precision = unit >= UNIT_MS.month ? (Math.round(unit / 2_592_000_000) >= 12 ? 'year' : 'month')
      : unit === UNIT_MS.week ? 'week' : unit === UNIT_MS.day ? 'day' : 'minute';
    return { iso: new Date(ms).toISOString(), precision, relative: true };
  }

  // Absolute: "Mar 4, 2021", "March 4 2021", "2021-03-04"
  const abs = /([\p{L}]+)\s+(\d{1,2}),?\s+(\d{4})/u.exec(s) ?? /^\s*(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (abs) {
    if (/^\d{4}-/.test(s)) {
      return { iso: s.trim(), precision: 'day', relative: false };
    }
    const mi = monthIndexFromName(abs[1], months ?? undefined);
    if (mi == null || mi < 0) return null;
    const day = Number(abs[2]);
    const year = Number(abs[3]);
    const dt = new Date(Date.UTC(year, mi, day));
    if (Number.isNaN(dt.getTime())) return null;
    return { iso: dt.toISOString().slice(0, 10), precision: 'day', relative: false };
  }

  // Absolute without day: "Mar 2021"
  const absMo = /^([a-z]+)[ .]*(\d{4})$/.exec(s);
  if (absMo) {
    const mi = monthIndexFromName(absMo[1], months ?? undefined);
    if (mi == null || mi < 0) return null;
    return { iso: `${absMo[2]}-${String(mi + 1).padStart(2, '0')}`, precision: 'month', relative: false };
  }

  return null;
}
