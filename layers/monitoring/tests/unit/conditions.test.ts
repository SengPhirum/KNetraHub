import { describe, it, expect } from 'vitest'
import { validateConditions, evaluateConditions } from '../../server/alerting/conditions'

describe('validateConditions', () => {
  it('accepts a simple valid leaf', () => {
    expect(validateConditions({ field: 'status', cmp: 'eq', value: 'down' })).toEqual([])
  })

  it('accepts a nested and/or tree', () => {
    const tree = {
      op: 'and',
      conditions: [
        { field: 'oper_status', cmp: 'eq', value: 'down' },
        { op: 'or', conditions: [{ field: 'admin_status', cmp: 'eq', value: 'up' }] }
      ]
    }
    expect(validateConditions(tree)).toEqual([])
  })

  it('rejects an invalid comparator', () => {
    const problems = validateConditions({ field: 'status', cmp: 'wat', value: 'down' })
    expect(problems.length).toBeGreaterThan(0)
  })

  it('rejects an invalid field name', () => {
    const problems = validateConditions({ field: 'DROP TABLE devices;', cmp: 'eq', value: 'x' })
    expect(problems.length).toBeGreaterThan(0)
  })

  it('rejects in/not_in without an array value', () => {
    expect(validateConditions({ field: 'os', cmp: 'in', value: 'linux' }).length).toBeGreaterThan(0)
  })

  it('rejects deeply nested trees beyond the depth limit', () => {
    let node: any = { field: 'a', cmp: 'eq', value: 1 }
    for (let i = 0; i < 8; i++) node = { op: 'and', conditions: [node] }
    expect(validateConditions(node).length).toBeGreaterThan(0)
  })

  it('rejects an empty condition group', () => {
    expect(validateConditions({ op: 'and', conditions: [] }).length).toBeGreaterThan(0)
  })
})

describe('evaluateConditions', () => {
  const device = { status: 'down', usage_percent: 95, os: 'linux', hostname: 'core-sw-01' }

  it('evaluates a simple eq leaf', () => {
    expect(evaluateConditions({ field: 'status', cmp: 'eq', value: 'down' }, device)).toBe(true)
    expect(evaluateConditions({ field: 'status', cmp: 'eq', value: 'up' }, device)).toBe(false)
  })

  it('evaluates numeric comparators', () => {
    expect(evaluateConditions({ field: 'usage_percent', cmp: 'gt', value: 90 }, device)).toBe(true)
    expect(evaluateConditions({ field: 'usage_percent', cmp: 'lt', value: 90 }, device)).toBe(false)
  })

  it('evaluates and/or composition', () => {
    const tree = {
      op: 'and',
      conditions: [
        { field: 'status', cmp: 'eq', value: 'down' },
        { field: 'usage_percent', cmp: 'ge', value: 95 }
      ]
    }
    expect(evaluateConditions(tree, device)).toBe(true)
    const orTree = { op: 'or', conditions: [{ field: 'status', cmp: 'eq', value: 'up' }, { field: 'os', cmp: 'eq', value: 'linux' }] }
    expect(evaluateConditions(orTree, device)).toBe(true)
  })

  it('evaluates contains/regex/in', () => {
    expect(evaluateConditions({ field: 'hostname', cmp: 'contains', value: 'core' }, device)).toBe(true)
    expect(evaluateConditions({ field: 'hostname', cmp: 'regex', value: '^core-sw-\\d+$' }, device)).toBe(true)
    expect(evaluateConditions({ field: 'os', cmp: 'in', value: ['windows', 'linux'] }, device)).toBe(true)
  })

  it('is_null / not_null on missing fields', () => {
    expect(evaluateConditions({ field: 'missing_field', cmp: 'is_null' }, device)).toBe(true)
    expect(evaluateConditions({ field: 'status', cmp: 'not_null' }, device)).toBe(true)
  })

  it('never executes arbitrary code from a malicious value', () => {
    const malicious = { field: 'hostname', cmp: 'regex', value: '(a+)+$' } // catastrophic-looking but bounded
    expect(() => evaluateConditions(malicious, device)).not.toThrow()
  })
})
