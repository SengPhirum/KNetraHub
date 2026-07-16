/**
 * Structured rule conditions: a validated JSON tree — never SQL from the UI.
 *
 *   { "op": "and"|"or", "conditions": [ <leaf|tree>, … ] }
 *   leaf: { "field": "status", "cmp": "eq", "value": "down" }
 *
 * Comparators: eq, ne, gt, ge, lt, le, contains, not_contains, regex,
 * not_regex, in, not_in, is_null, not_null.
 *
 * Fields are plain column names of the entity snapshot the rule evaluates
 * against (device row, port row joined with device_*, sensor row, …).
 */

export type Comparator =
  | 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le'
  | 'contains' | 'not_contains' | 'regex' | 'not_regex'
  | 'in' | 'not_in' | 'is_null' | 'not_null'

export interface LeafCondition {
  field: string
  cmp: Comparator
  value?: unknown
}
export interface ConditionTree {
  op: 'and' | 'or'
  conditions: (LeafCondition | ConditionTree)[]
}

export function isTree(node: unknown): node is ConditionTree {
  return !!node && typeof node === 'object' && 'op' in (node as any) && Array.isArray((node as any).conditions)
}

const COMPARATORS: Comparator[] = ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'contains', 'not_contains', 'regex', 'not_regex', 'in', 'not_in', 'is_null', 'not_null']
const FIELD_PATTERN = /^[a-z][a-z0-9_.]{0,63}$/

/** Validate a condition tree; returns a list of problems (empty = valid). */
export function validateConditions(node: unknown, depth = 0): string[] {
  const problems: string[] = []
  if (depth > 5) return ['conditions nested too deeply (max 5 levels)']
  if (isTree(node)) {
    if (node.op !== 'and' && node.op !== 'or') problems.push(`invalid op "${(node as any).op}"`)
    if (!node.conditions.length) problems.push('empty condition group')
    if (node.conditions.length > 50) problems.push('too many conditions in one group (max 50)')
    for (const child of node.conditions) problems.push(...validateConditions(child, depth + 1))
    return problems
  }
  const leaf = node as LeafCondition
  if (!leaf || typeof leaf !== 'object') return ['condition must be an object']
  if (!leaf.field || !FIELD_PATTERN.test(leaf.field)) problems.push(`invalid field "${String((leaf as any).field)}"`)
  if (!COMPARATORS.includes(leaf.cmp)) problems.push(`invalid comparator "${String((leaf as any).cmp)}"`)
  if (leaf.cmp === 'regex' || leaf.cmp === 'not_regex') {
    try {
      // Reject catastrophic patterns cheaply: bounded length only.
      if (String(leaf.value ?? '').length > 200) problems.push('regex too long')
      new RegExp(String(leaf.value ?? ''))
    } catch {
      problems.push(`invalid regex "${String(leaf.value)}"`)
    }
  }
  if ((leaf.cmp === 'in' || leaf.cmp === 'not_in') && !Array.isArray(leaf.value)) {
    problems.push(`"${leaf.cmp}" needs an array value`)
  }
  return problems
}

/** Evaluate a condition tree against an entity snapshot (row object). */
export function evaluateConditions(node: unknown, entity: Record<string, unknown>): boolean {
  if (isTree(node)) {
    const results = node.conditions.map((child) => evaluateConditions(child, entity))
    return node.op === 'and' ? results.every(Boolean) : results.some(Boolean)
  }
  const leaf = node as LeafCondition
  const raw = entity[leaf.field]
  switch (leaf.cmp) {
    case 'is_null':
      return raw == null
    case 'not_null':
      return raw != null
    case 'eq':
      return looseEqual(raw, leaf.value)
    case 'ne':
      return !looseEqual(raw, leaf.value)
    case 'gt':
    case 'ge':
    case 'lt':
    case 'le': {
      const a = Number(raw)
      const b = Number(leaf.value)
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false
      if (leaf.cmp === 'gt') return a > b
      if (leaf.cmp === 'ge') return a >= b
      if (leaf.cmp === 'lt') return a < b
      return a <= b
    }
    case 'contains':
      return raw != null && String(raw).toLowerCase().includes(String(leaf.value ?? '').toLowerCase())
    case 'not_contains':
      return raw == null || !String(raw).toLowerCase().includes(String(leaf.value ?? '').toLowerCase())
    case 'regex':
      return raw != null && safeRegex(String(leaf.value ?? '')).test(String(raw))
    case 'not_regex':
      return raw == null || !safeRegex(String(leaf.value ?? '')).test(String(raw))
    case 'in':
      return Array.isArray(leaf.value) && leaf.value.some((v) => looseEqual(raw, v))
    case 'not_in':
      return !Array.isArray(leaf.value) || !leaf.value.some((v) => looseEqual(raw, v))
    default:
      return false
  }
}

function looseEqual(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== '' && String(b).trim() !== '') return na === nb
  if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b)
  return String(a).toLowerCase() === String(b).toLowerCase()
}

function safeRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern.slice(0, 200), 'i')
  } catch {
    return /$^/ // never matches
  }
}
