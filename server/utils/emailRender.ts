/**
 * Email template rendering: {{ dotted.path }} interpolation plus a small,
 * dependency-free Markdown subset renderer.
 *
 * Injection safety. Interpolated values are never spliced into the template
 * source as text - they are swapped for opaque tokens BEFORE the body is
 * converted, then substituted back HTML-escaped afterwards. That means a
 * value carrying `<script>`, `**`, or `[x](javascript:…)` can never introduce
 * markup or Markdown structure, in either format. The template source itself
 * is admin-authored (admin-only page): in `markdown` format its raw HTML is
 * escaped, in `html` format it is trusted verbatim - which is the whole point
 * of choosing that format.
 *
 * Output is a multipart message: styled HTML plus an auto-derived plain-text
 * alternative, so text-only clients and spam scoring both stay happy.
 */

const MAX_OUTPUT = 100_000
// U+0000 can't appear in a template body (JSON-decoded text), so it makes a
// token delimiter no admin input can forge.
const TOKEN = (i: number) => `\u0000v${i}\u0000`
const TOKEN_RE = /\u0000v(\d+)\u0000/g

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export interface EmailTemplateSource {
  subject: string
  format: 'markdown' | 'html'
  body: string
}

export function renderEmail(template: EmailTemplateSource, ctx: Record<string, unknown>): RenderedEmail {
  // Subject is plain text - interpolate directly, collapse newlines.
  const subject = interpolateRaw(template.subject, ctx).replace(/\s+/g, ' ').trim().slice(0, 300)

  const { tokenized, values } = tokenize(template.body, ctx)
  const bodyHtml = template.format === 'html' ? tokenized : markdownToHtml(tokenized)

  const html = wrapHtmlDocument(detokenize(bodyHtml, values, escapeHtml), subject)
  const text = detokenize(toPlainText(tokenized, template.format), values, (v) => v)

  return {
    subject,
    html: clamp(html),
    text: clamp(text)
  }
}

/** Replace every placeholder with an opaque token, collecting the raw values. */
function tokenize(source: string, ctx: Record<string, unknown>): { tokenized: string; values: string[] } {
  const values: string[] = []
  const tokenized = source.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) => {
    const value = lookupPath(ctx, path)
    values.push(value == null ? '' : String(value))
    return TOKEN(values.length - 1)
  })
  return { tokenized, values }
}

function detokenize(source: string, values: string[], transform: (v: string) => string): string {
  return source.replace(TOKEN_RE, (_, i: string) => transform(values[Number(i)] ?? ''))
}

/** Direct interpolation for plain-text contexts (the subject line). */
function interpolateRaw(source: string, ctx: Record<string, unknown>): string {
  return source.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) => {
    const value = lookupPath(ctx, path)
    return value == null ? '' : String(value)
  })
}

/**
 * Walk a dotted path over the context. Refuses to render objects (so a typo
 * never dumps a whole context branch) and hard-blocks credential-ish keys, so
 * a template can never exfiltrate a secret that ends up in the context.
 */
function lookupPath(obj: Record<string, unknown>, path: string): unknown {
  let current: unknown = obj
  for (const part of path.split('.')) {
    if (current == null || typeof current !== 'object') return null
    if (/password|secret|token|credential|apikey|api_key/i.test(part)) return null
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'object' ? null : current
}

function clamp(s: string): string {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + '…' : s
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── markdown ─────────────────────────────────────────────────────────────────

// Inline styles rather than a <style> block: Gmail and Outlook strip or
// partially apply document-level CSS, but honour inline style attributes.
const S = {
  h1: 'margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;color:#0f172a;',
  h2: 'margin:24px 0 12px;font-size:18px;line-height:1.35;font-weight:600;color:#0f172a;',
  h3: 'margin:20px 0 10px;font-size:15px;line-height:1.4;font-weight:600;color:#0f172a;',
  p: 'margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155;',
  li: 'margin:0 0 6px;font-size:14px;line-height:1.6;color:#334155;',
  ul: 'margin:0 0 14px;padding-left:20px;',
  a: 'color:#2496ED;text-decoration:underline;',
  code: 'background:#f1f5f9;border-radius:4px;padding:1px 5px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:#0f172a;',
  pre: 'margin:0 0 14px;padding:12px 14px;background:#0f172a;border-radius:8px;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.5;color:#e2e8f0;white-space:pre-wrap;',
  quote: 'margin:0 0 14px;padding:8px 14px;border-left:3px solid #cbd5e1;background:#f8fafc;font-size:14px;line-height:1.6;color:#475569;',
  hr: 'margin:24px 0;border:0;border-top:1px solid #e2e8f0;'
}

/**
 * A deliberately small Markdown subset: headings, bold/italic, inline code,
 * fenced code, links, bullet and numbered lists, blockquotes, and rules.
 * Enough for transactional email; no tables, images, or reference links.
 */
export function markdownToHtml(md: string): string {
  const lines = escapeHtml(md.replace(/\r\n/g, '\n')).split('\n')
  const out: string[] = []
  let i = 0

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return
    out.push(`<p style="${S.p}">${inline(buf.join('\n'))}</p>`)
    buf.length = 0
  }

  const paragraph: string[] = []

  while (i < lines.length) {
    const line = lines[i] ?? ''

    // Fenced code block
    if (/^\s*```/.test(line)) {
      flushParagraph(paragraph)
      const code: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? '')) {
        code.push(lines[i] ?? '')
        i++
      }
      i++ // consume the closing fence
      out.push(`<pre style="${S.pre}">${code.join('\n')}</pre>`)
      continue
    }

    // Horizontal rule
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flushParagraph(paragraph)
      out.push(`<hr style="${S.hr}">`)
      i++
      continue
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph(paragraph)
      const level = Math.min(3, heading[1]!.length)
      const style = level === 1 ? S.h1 : level === 2 ? S.h2 : S.h3
      out.push(`<h${level} style="${style}">${inline(heading[2]!)}</h${level}>`)
      i++
      continue
    }

    // Blockquote (consecutive "> " lines)
    if (/^\s*&gt;\s?/.test(line)) {
      flushParagraph(paragraph)
      const quote: string[] = []
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i] ?? '')) {
        quote.push((lines[i] ?? '').replace(/^\s*&gt;\s?/, ''))
        i++
      }
      out.push(`<blockquote style="${S.quote}">${inline(quote.join('\n'))}</blockquote>`)
      continue
    }

    // Lists (bullet or ordered)
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flushParagraph(paragraph)
      const ordered = /^\s*\d+\.\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*([-*+]|\d+\.)\s+/, ''))
        i++
      }
      const tag = ordered ? 'ol' : 'ul'
      const li = items.map((t) => `<li style="${S.li}">${inline(t)}</li>`).join('')
      out.push(`<${tag} style="${S.ul}">${li}</${tag}>`)
      continue
    }

    // Blank line ends a paragraph
    if (!line.trim()) {
      flushParagraph(paragraph)
      i++
      continue
    }

    paragraph.push(line)
    i++
  }

  flushParagraph(paragraph)
  return out.join('\n')
}

/** Inline spans, applied to already HTML-escaped text. */
function inline(text: string): string {
  return text
    // `code` first, so emphasis markers inside it are left alone
    .replace(/`([^`]+)`/g, (_, c) => `<code style="${S.code}">${c}</code>`)
    // [label](url) - only http(s) and mailto: survive, so a template can't
    // smuggle javascript: or data: into a mail client that would follow it
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, href: string) => {
      if (!/^(https?:\/\/|mailto:)/i.test(href)) return label
      return `<a href="${href}" style="${S.a}">${label}</a>`
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
    // Markdown hard break (two trailing spaces) and remaining newlines
    .replace(/ {2}\n/g, '<br>')
    .replace(/\n/g, '<br>')
}

/** Outer document: centred card, safe fallbacks, dark-mode friendly. */
function wrapHtmlDocument(bodyHtml: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
<tr><td style="padding:28px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${bodyHtml}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

// ─── plain-text alternative ───────────────────────────────────────────────────

/** Strip formatting down to readable text for the text/plain part. */
function toPlainText(source: string, format: 'markdown' | 'html'): string {
  let s = source.replace(/\r\n/g, '\n')

  if (format === 'html') {
    s = s
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<hr\s*\/?>/gi, '\n---\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  } else {
    // Every anchored pattern below uses [ \t] rather than \s: with the `m`
    // flag, a leading \s* happily consumes the preceding blank line, which
    // silently collapses the paragraph spacing of the text alternative.
    s = s
      .replace(/^```.*$/gm, '')
      .replace(/^(#{1,6})[ \t]+/gm, '')
      .replace(/^[ \t]*([-*_])[ \t]*\1[ \t]*\1[ \t\-*_]*$/gm, '---')
      .replace(/^[ \t]*[-*+][ \t]+/gm, '- ')
      // Keep the URL visible: "label (https://…)"
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^[ \t]*&gt;[ \t]?/gm, '')
      .replace(/^[ \t]*>[ \t]?/gm, '')
  }

  return s.replace(/\n{3,}/g, '\n\n').trim()
}
