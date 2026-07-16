// Small browser file I/O helpers shared by every Export/Import button
// (Monitoring devices, IPAM inventories, ...) - triggering a download and
// opening a file picker are the same two lines everywhere, so they live here
// once rather than being copy-pasted per page.

/** Trigger a browser download of a Blob (e.g. a server-generated .xlsx). */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Trigger a browser download of `content` as `filename`. */
export function downloadText(filename: string, content: string, mime = 'application/json'): void {
  downloadBlob(filename, new Blob([content], { type: mime }))
}

export function downloadJson(filename: string, data: unknown): void {
  downloadText(filename, JSON.stringify(data, null, 2), 'application/json')
}

/** Serialize rows to CSV for the Export-as-CSV buttons (e.g. Devices).
 *  Client-side twin of the server-side CSV writers - duplicated rather than
 *  shared because server/utils isn't part of the client bundle. */
export function toCsv(rows: Record<string, any>[], columns: string[]): string {
  const esc = (v: any) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [columns.join(',')]
  for (const r of rows) lines.push(columns.map((c) => esc(r[c])).join(','))
  return lines.join('\n')
}

/** Open a native file picker (optionally restricted by `accept`) and resolve
 *  with the chosen file's name + text content, or null if the user cancels. */
export function pickAndReadFile(accept = '.json,.csv'): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      resolve({ name: file.name, text: await file.text() })
    }
    input.click()
  })
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}
export function exportFilename(base: string, ext: 'json' | 'csv' | 'xlsx'): string {
  return `${base}-${stamp()}.${ext}`
}
