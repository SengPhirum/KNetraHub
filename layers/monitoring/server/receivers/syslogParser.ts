/**
 * Pure RFC 3164 / RFC 5424 syslog parsing — no I/O, no Nuxt aliases, so it's
 * directly unit-testable. The receiver (syslog.ts) wraps this with sockets
 * and device resolution.
 */

export interface ParsedSyslog {
  facility: number | null
  severity: number | null
  hostname: string | null
  appName: string | null
  procId: string | null
  msgId: string | null
  message: string
  structuredData: Record<string, unknown> | null
  rfc: '3164' | '5424' | 'raw'
}

const RFC5424 = /^<(\d{1,3})>(\d)\s(\S+)\s(\S+)\s(\S+)\s(\S+)\s(\S+)\s(-|\[.*?\])\s?(.*)$/s
const RFC3164 = /^<(\d{1,3})>([A-Z][a-z]{2}\s+\d{1,2}\s\d{2}:\d{2}:\d{2})\s(\S+)\s(.*)$/s

export function parseSyslog(raw: string): ParsedSyslog {
  const m5424 = raw.match(RFC5424)
  if (m5424) {
    const pri = Number(m5424[1])
    return {
      facility: Math.floor(pri / 8),
      severity: pri % 8,
      hostname: nil(m5424[4]),
      appName: nil(m5424[5]),
      procId: nil(m5424[6]),
      msgId: nil(m5424[7]),
      structuredData: m5424[8] && m5424[8] !== '-' ? { raw: m5424[8] } : null,
      message: (m5424[9] ?? '').replace(/^﻿/, '').trim(),
      rfc: '5424'
    }
  }
  const m3164 = raw.match(RFC3164)
  if (m3164) {
    const pri = Number(m3164[1])
    // "hostname tag: content" — split the tag off the content
    const rest = m3164[4] ?? ''
    const tagMatch = rest.match(/^([A-Za-z0-9_\-./]+)(?:\[(\d+)\])?:\s?(.*)$/s)
    return {
      facility: Math.floor(pri / 8),
      severity: pri % 8,
      hostname: nil(m3164[3]),
      appName: tagMatch ? tagMatch[1] ?? null : null,
      procId: tagMatch?.[2] ?? null,
      msgId: null,
      structuredData: null,
      message: (tagMatch ? tagMatch[3] : rest)?.trim() ?? '',
      rfc: '3164'
    }
  }
  // Bare "<pri>message" or completely raw
  const priMatch = raw.match(/^<(\d{1,3})>(.*)$/s)
  if (priMatch) {
    const pri = Number(priMatch[1])
    return { facility: Math.floor(pri / 8), severity: pri % 8, hostname: null, appName: null, procId: null, msgId: null, structuredData: null, message: priMatch[2]!.trim(), rfc: 'raw' }
  }
  return { facility: null, severity: null, hostname: null, appName: null, procId: null, msgId: null, structuredData: null, message: raw.trim(), rfc: 'raw' }
}

function nil(v: string | undefined): string | null {
  return !v || v === '-' ? null : v
}
