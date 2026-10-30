// CSV/JSON exporters with schema versioning and formula-injection protection.
export const EXPORT_SCHEMA_VERSION = 1;

function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  // Neutralize CSV-formula injection: prefix =,+,unusual @ or tab starts with
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replaceAll('"', '""') + '"';
  return s;
}

export function toCsv(rows, headers) {
  const hdr = headers ?? (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [hdr.map(csvCell).join(',')];
  for (const r of rows) lines.push(hdr.map((h) => csvCell(r[h])).join(','));
  return lines.join('\n') + '\n';
}

export function toJsonExport(rows, meta = {}) {
  return JSON.stringify({
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ...meta,
    reviews: rows,
  }, null, 2) + '\n';
}
