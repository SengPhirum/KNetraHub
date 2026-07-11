const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]!)
}

/**
 * Escape `text` for v-html and wrap every case-insensitive occurrence of the
 * whitespace-separated query tokens in <mark> so search matches stay visible
 * inside the sidebar filter and the docs search palette.
 */
export function highlightText(text: string, query: string): string {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!tokens.length) return escapeHtml(text)

  const lower = text.toLowerCase()
  const ranges: Array<[number, number]> = []
  for (const token of tokens) {
    let from = 0
    while (from <= lower.length - token.length) {
      const at = lower.indexOf(token, from)
      if (at === -1) break
      ranges.push([at, at + token.length])
      from = at + token.length
    }
  }
  if (!ranges.length) return escapeHtml(text)

  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else merged.push([range[0], range[1]])
  }

  let html = ''
  let cursor = 0
  for (const [start, end] of merged) {
    html += escapeHtml(text.slice(cursor, start)) + `<mark>${escapeHtml(text.slice(start, end))}</mark>`
    cursor = end
  }
  return html + escapeHtml(text.slice(cursor))
}
