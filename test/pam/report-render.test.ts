import { describe, it, expect } from 'vitest'
import { toCsv, toXlsx, toPdf } from '../../layers/pam/server/utils/pamReportRenderCore'

const columns = ['name', 'note']
const rows = [
  { name: 'alice', note: 'plain' },
  { name: 'bob', note: 'has,comma "quote"\nnewline' }
]

describe('toCsv', () => {
  it('emits an RFC-4180 header row and escapes commas, quotes and newlines', () => {
    const csv = toCsv(columns, rows).toString('utf8')
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('name,note')
    expect(lines[1]).toBe('alice,plain')
    // field with comma/quote/newline is wrapped in quotes and internal quotes doubled
    expect(csv).toContain('"has,comma ""quote""\nnewline"')
  })
})

describe('toXlsx', () => {
  it('produces a valid xlsx (zip) that round-trips back to the same cells', async () => {
    const buf = await toXlsx('Test', columns, rows)
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK') // zip local-file signature
    const ExcelJS = (await import('exceljs')).default as any
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.worksheets[0]
    expect(ws.getRow(1).getCell(1).value).toBe('name')
    expect(ws.getRow(2).getCell(1).value).toBe('alice')
    expect(ws.getRow(3).getCell(2).value).toContain('newline')
  })
})

describe('toPdf', () => {
  it('produces a structurally valid single-file PDF', () => {
    const pdf = toPdf('Inventory', columns, rows, '2026-07-24T00:00:00.000Z').toString('latin1')
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('/Type /Catalog')
    expect(pdf).toContain('/BaseFont /Helvetica')
    expect(pdf.includes('startxref')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
  })
})
