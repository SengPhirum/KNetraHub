import { getDb } from '~~/server/utils/db'

/**
 * Minimal RFC4180 CSV parser (quoted fields, "" escapes, CRLF/LF). A local
 * port of layers/monitoring/server/utils/importExport.ts's parseCsv - kept
 * separate rather than imported cross-layer.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  const s = text.replace(/\r\n/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  if (!rows.length) return []
  const header = rows[0]!.map((h) => h.trim())
  return rows.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {}
      header.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim() })
      return obj
    })
}

/** First id whose `nameCol` case-insensitively matches `name`, or null. Table/column are fixed, compile-time-known strings - never derived from request input. */
export async function resolveIdByName(table: string, nameCol: string, name: string | undefined | null): Promise<string | null> {
  const trimmed = String(name || '').trim()
  if (!trimmed) return null
  const { rows } = await getDb().query(`SELECT id FROM ${table} WHERE lower(${nameCol}) = lower($1) LIMIT 1`, [trimmed])
  return rows[0]?.id ?? null
}
