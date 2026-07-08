/**
 * Shared helpers for the Monitoring app's export/import features (Devices,
 * Hosts, Groups, Templates, Sensors). Two responsibilities:
 *  1. Generic CSV serialize/parse (RFC4180-ish: quoted fields, embedded commas
 *     and quotes) so any tabular endpoint can offer a CSV download/upload.
 *  2. A best-effort converter from Zabbix's JSON template export format
 *     (`zabbix_export.templates[]`) into our native
 *     `{ name, description, items[], triggers[] }` template shape, so
 *     Server > Templates import can accept a real Zabbix export alongside our
 *     own native format.
 */

// ── CSV ──────────────────────────────────────────────────────────────────────
export function toCsv(rows: Record<string, any>[], columns: string[]): string {
  const esc = (v: any) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [columns.join(',')]
  for (const r of rows) lines.push(columns.map((c) => esc(r[c])).join(','))
  return lines.join('\n')
}

/** Minimal RFC4180 CSV parser: quoted fields, "" escapes, CRLF/LF. */
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

// ── Zabbix template format ──────────────────────────────────────────────────
export interface NativeTemplateItem {
  name: string
  key_: string
  type: string
  value_type: 'numeric' | 'text'
  units: string | null
  snmp_oid: string | null
  update_interval: number
}
export interface NativeTemplateTrigger {
  name: string
  item_key: string
  operator: string
  threshold: number
  for_seconds: number
  severity: number
}
export interface NativeTemplate {
  name: string
  description: string | null
  items: NativeTemplateItem[]
  triggers: NativeTemplateTrigger[]
}

/** Zabbix delay/window strings ("60s", "5m", "1h", or a bare number of
 *  seconds) to whole seconds. Unrecognized input defaults to 60s. */
export function zabbixDelayToSeconds(delay: string): number {
  const m = /^(\d+)\s*([smhdw])?$/.exec(String(delay ?? '').trim())
  if (!m) return 60
  const n = Number(m[1])
  const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[m[2] as 's' | 'm' | 'h' | 'd' | 'w'] ?? 1
  return n * mult
}

export function zabbixValueType(vt: string | undefined): 'numeric' | 'text' {
  const v = String(vt ?? '').toUpperCase()
  return v === 'FLOAT' || v === 'UNSIGNED' ? 'numeric' : 'text'
}

export function zabbixItemType(type: string | undefined, hasOid: boolean): string {
  const t = String(type ?? '').toUpperCase()
  if (hasOid || t.includes('SNMP')) return 'snmp'
  if (t.includes('INTERNAL')) return 'internal'
  return 'agent'
}

const ZABBIX_SEVERITY: Record<string, number> = {
  NOT_CLASSIFIED: 0, INFORMATION: 1, WARNING: 2, AVERAGE: 3, HIGH: 4, DISASTER: 5
}
export function zabbixSeverity(priority: string | undefined): number {
  return ZABBIX_SEVERITY[String(priority ?? '').toUpperCase()] ?? 2
}

/**
 * Best-effort parse of a Zabbix trigger expression into our flat
 * {item, operator, threshold} shape. Zabbix expressions are a full function
 * grammar (`avg(/Host/key,5m)>90`, compound `and`/`or`, `{$MACRO}` thresholds,
 * multi-item expressions...) - we only support the common single-condition
 * case, which covers the large majority of real templates:
 *   FUNC(/Template/item.key[,window]) OPERATOR THRESHOLD
 * Rather than parse Zabbix's item-key/bracket-parameter grammar, we match
 * against the set of item keys already imported from the same template (the
 * longest match wins, so a key that's a prefix of another isn't picked by
 * mistake) - this sidesteps keys containing their own commas/brackets
 * entirely. Returns null (caller should skip + report the trigger) when the
 * expression uses `and`/`or`, a `{$MACRO}` threshold, or matches no known key. */
export function parseZabbixTrigger(
  expression: string,
  knownItemKeys: string[]
): { itemKey: string; operator: string; threshold: number; forSeconds: number } | null {
  const expr = String(expression ?? '')
  if (/\b(and|or)\b/i.test(expr)) return null
  if (expr.includes('{$')) return null

  const tail = /(>=|<=|!=|=|>|<)\s*(-?\d+(?:\.\d+)?)\s*\)*\s*$/.exec(expr)
  if (!tail) return null
  const operator = tail[1]!
  const threshold = Number(tail[2])

  const itemKey = [...knownItemKeys].sort((a, b) => b.length - a.length).find((k) => k && expr.includes(k))
  if (!itemKey) return null

  const windowMatch = /,\s*(\d+[smhdw]?)\s*\)/.exec(expr)
  const forSeconds = windowMatch ? zabbixDelayToSeconds(windowMatch[1]!) : 0

  return { itemKey, operator, threshold, forSeconds }
}

/** Convert one Zabbix export template object into our native template shape.
 *  `skipped` lists trigger names/expressions that couldn't be converted (still
 *  imports the rest of the template). */
export function zabbixTemplateToNative(tpl: any): { template: NativeTemplate; skipped: string[] } {
  const items: NativeTemplateItem[] = (Array.isArray(tpl?.items) ? tpl.items : []).map((it: any) => ({
    name: String(it.name || it.key || 'item').slice(0, 120),
    key_: String(it.key || '').slice(0, 120),
    type: zabbixItemType(it.type, !!it.snmp_oid),
    value_type: zabbixValueType(it.value_type),
    units: it.units ? String(it.units).slice(0, 40) : null,
    snmp_oid: it.snmp_oid ? String(it.snmp_oid).slice(0, 200) : null,
    update_interval: zabbixDelayToSeconds(it.delay || '60s')
  })).filter((i) => i.key_)

  const knownKeys = items.map((i) => i.key_)
  const triggers: NativeTemplateTrigger[] = []
  const skipped: string[] = []
  for (const tr of Array.isArray(tpl?.triggers) ? tpl.triggers : []) {
    const parsed = parseZabbixTrigger(tr?.expression || '', knownKeys)
    if (!parsed) { skipped.push(tr?.name || tr?.expression || 'unnamed trigger'); continue }
    triggers.push({
      name: String(tr?.name || `${parsed.itemKey} ${parsed.operator} ${parsed.threshold}`).slice(0, 160),
      item_key: parsed.itemKey,
      operator: parsed.operator,
      threshold: parsed.threshold,
      for_seconds: parsed.forSeconds,
      severity: zabbixSeverity(tr?.priority)
    })
  }

  return {
    template: {
      name: String(tpl?.template || tpl?.name || 'Imported template').slice(0, 120),
      description: tpl?.description ? String(tpl.description).slice(0, 500) : null,
      items,
      triggers
    },
    skipped
  }
}

/** True when the uploaded JSON looks like a Zabbix `configuration.export`
 *  (`{ zabbix_export: { templates: [...] } }`). */
export function isZabbixExport(body: any): boolean {
  return !!body && typeof body === 'object' && !!body.zabbix_export && Array.isArray(body.zabbix_export.templates)
}
