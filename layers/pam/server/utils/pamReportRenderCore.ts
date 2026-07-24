/**
 * Stage 8 — pure report renderers (no DB / Nitro imports, so unit-testable).
 * CSV (RFC-4180), real XLSX (exceljs), and a dependency-free minimal PDF.
 */

export type ReportFormat = 'csv' | 'xlsx' | 'pdf' | 'json'
export interface ReportData { key: string; title: string; columns: string[]; rows: any[]; generatedAt: string }

export const cell = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** RFC-4180 CSV with CRLF line endings. */
export function toCsv(columns: string[], rows: any[]): Buffer {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lines = [columns.map((c) => esc(c)).join(',')]
  for (const r of rows) lines.push(columns.map((c) => esc(cell(r[c]))).join(','))
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8')
}

/** Real .xlsx via exceljs (already a dependency). */
export async function toXlsx(title: string, columns: string[], rows: any[]): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default as any
  const wb = new ExcelJS.Workbook()
  wb.creator = 'KNetraHub PAM'
  const ws = wb.addWorksheet((title || 'Report').slice(0, 31))
  ws.columns = columns.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(12, c.length + 2)) }))
  ws.getRow(1).font = { bold: true }
  for (const r of rows) ws.addRow(Object.fromEntries(columns.map((c) => [c, cell(r[c])])))
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

/** Minimal but valid PDF (Helvetica text table, paginated) — dependency-free. */
export function toPdf(title: string, columns: string[], rows: any[], generatedAt = new Date().toISOString()): Buffer {
  const escPdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
  const lines: string[] = [title, `Generated ${generatedAt}`, '', trunc(columns.join(' | '), 110)]
  for (const r of rows) lines.push(trunc(columns.map((c) => cell(r[c])).join(' | '), 110))

  const PER_PAGE = 46
  const pages: string[][] = []
  for (let i = 0; i < lines.length; i += PER_PAGE) pages.push(lines.slice(i, i + PER_PAGE))
  if (!pages.length) pages.push([title])

  const objs: string[] = []
  const pageNums: number[] = []
  const contentNums: number[] = []
  let n = 4 // 1=Catalog, 2=Pages, 3=Font
  for (let i = 0; i < pages.length; i++) { pageNums.push(n++); contentNums.push(n++) }

  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = `<< /Type /Pages /Kids [${pageNums.map((p) => `${p} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  pages.forEach((pl, i) => {
    objs[pageNums[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNums[i]} 0 R >>`
    let stream = 'BT /F1 9 Tf 40 752 Td 12 TL\n'
    for (const l of pl) stream += `(${escPdf(l)}) Tj T*\n`
    stream += 'ET'
    objs[contentNums[i]] = `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`
  })

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(body, 'utf8')
    body += `${i} 0 obj\n${objs[i]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body, 'utf8')
  const count = objs.length
  body += `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let i = 1; i < count; i++) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(body, 'utf8')
}

export const CONTENT_TYPE: Record<ReportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  json: 'application/json; charset=utf-8'
}

export async function renderReport(data: ReportData, format: ReportFormat): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  let buffer: Buffer
  if (format === 'csv') buffer = toCsv(data.columns, data.rows)
  else if (format === 'xlsx') buffer = await toXlsx(data.title, data.columns, data.rows)
  else if (format === 'pdf') buffer = toPdf(data.title, data.columns, data.rows, data.generatedAt)
  else buffer = Buffer.from(JSON.stringify(data, null, 2), 'utf8')
  const stamp = data.generatedAt.replace(/[:.]/g, '-')
  return { buffer, contentType: CONTENT_TYPE[format], filename: `${data.key}_${stamp}.${format}` }
}
