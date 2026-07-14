// Spreadsheet-formula-injection guard for IPAM CSV exports: a cell value
// starting with =, +, -, @, tab, or CR is prefixed with a leading apostrophe
// so Excel/Sheets treat it as text rather than evaluating it as a formula
// when the file is reopened.
const DANGEROUS_PREFIX = /^[=+\-@\t\r]/

export function sanitizeForCsv(value: unknown): string {
  const s = value == null ? '' : String(value)
  return DANGEROUS_PREFIX.test(s) ? `'${s}` : s
}

/** Apply sanitizeForCsv to every string field of every row before toCsv(). */
export function sanitizeRowsForCsv(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? sanitizeForCsv(v) : v])))
}
