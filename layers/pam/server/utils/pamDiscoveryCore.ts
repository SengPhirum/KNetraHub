/**
 * Pure discovery/onboarding-rule engine (no DB/Nuxt imports) — unit-testable.
 * A rule's `conditions` is a nested tree of all/any/not groups and leaf
 * comparisons evaluated against a normalized discovered-account record.
 */

export interface DiscoveredFacts {
  username?: string
  address?: string | null
  account_type?: string | null
  os_type?: string | null
  environment?: string | null
  privilege_level?: string | null
  privileged_group?: unknown
  non_expiring?: boolean | null
  dormant?: boolean | null
  shared?: boolean | null
  password_age_days?: number | null
  source_type?: string | null
  tags?: string[]
  [k: string]: unknown
}

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: string; op: string; value?: unknown }

function ipToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim())
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some((p) => p > 255)) return null
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const [net, bitsRaw] = cidr.split('/')
  const bits = Number(bitsRaw)
  const a = ipToInt(ip || '')
  const n = ipToInt(net || '')
  if (a === null || n === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false
  if (bits === 0) return true
  const mask = (0xffffffff << (32 - bits)) >>> 0
  return (a & mask) === (n & mask)
}

function compare(op: string, actual: unknown, value: unknown): boolean {
  const s = actual === undefined || actual === null ? '' : String(actual)
  switch (op) {
    case 'eq': return s === String(value)
    case 'neq': return s !== String(value)
    case 'contains': return s.toLowerCase().includes(String(value).toLowerCase())
    case 'startsWith': return s.toLowerCase().startsWith(String(value).toLowerCase())
    case 'endsWith': return s.toLowerCase().endsWith(String(value).toLowerCase())
    case 'matches': try { return new RegExp(String(value)).test(s) } catch { return false }
    case 'in': return Array.isArray(value) && value.map(String).includes(s)
    case 'cidr': return ipInCidr(s, String(value))
    case 'gt': return Number(actual) > Number(value)
    case 'lt': return Number(actual) < Number(value)
    case 'gte': return Number(actual) >= Number(value)
    case 'lte': return Number(actual) <= Number(value)
    case 'exists': return actual !== undefined && actual !== null && actual !== ''
    case 'isTrue': return actual === true || actual === 'true'
    case 'isFalse': return actual === false || actual === 'false' || actual === undefined || actual === null
    default: return false
  }
}

export function evaluateConditions(cond: Condition | null | undefined, facts: DiscoveredFacts): boolean {
  if (!cond) return true // empty condition = match all
  if ('all' in cond) return cond.all.every((c) => evaluateConditions(c, facts))
  if ('any' in cond) return cond.any.length === 0 || cond.any.some((c) => evaluateConditions(c, facts))
  if ('not' in cond) return !evaluateConditions(cond.not, facts)
  if ('field' in cond) return compare(cond.op, facts[cond.field], cond.value)
  return false
}

export interface RuleLike {
  id: string
  priority: number
  enabled: boolean
  conditions: Condition | null
  action: string
}

/** First enabled rule (lowest priority number wins) whose conditions match. */
export function matchRule<T extends RuleLike>(rules: T[], facts: DiscoveredFacts): T | null {
  const ordered = [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority)
  for (const r of ordered) {
    if (evaluateConditions(r.conditions, facts)) return r
  }
  return null
}

/** Stable dedup key for a discovered account. */
export function discoveryFingerprint(sourceId: string, address: string | null | undefined, username: string): string {
  return `${sourceId}:${(address || '').toLowerCase()}:${username.toLowerCase()}`
}

/** Detect conflicts among rules — same priority, or an earlier rule that
 * shadows a later one because its conditions are a strict superset match. */
export function ruleConflicts(rules: RuleLike[]): Array<{ a: string; b: string; reason: string }> {
  const out: Array<{ a: string; b: string; reason: string }> = []
  const enabled = rules.filter((r) => r.enabled)
  for (let i = 0; i < enabled.length; i++) {
    for (let j = i + 1; j < enabled.length; j++) {
      if (enabled[i]!.priority === enabled[j]!.priority) {
        out.push({ a: enabled[i]!.id, b: enabled[j]!.id, reason: `same priority ${enabled[i]!.priority}` })
      }
    }
  }
  return out
}
