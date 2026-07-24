import { describe, it, expect } from 'vitest'
import { evaluateConditions, matchRule, ipInCidr, discoveryFingerprint, ruleConflicts, type RuleLike } from '../../layers/pam/server/utils/pamDiscoveryCore'

describe('discovery — condition evaluation', () => {
  const facts = { username: 'root', address: '10.0.1.5', account_type: 'linux', privilege_level: 'root', non_expiring: true, environment: 'production', password_age_days: 400 }

  it('leaf operators', () => {
    expect(evaluateConditions({ field: 'username', op: 'eq', value: 'root' }, facts)).toBe(true)
    expect(evaluateConditions({ field: 'username', op: 'matches', value: '^r.*t$' }, facts)).toBe(true)
    expect(evaluateConditions({ field: 'address', op: 'cidr', value: '10.0.1.0/24' }, facts)).toBe(true)
    expect(evaluateConditions({ field: 'address', op: 'cidr', value: '10.0.2.0/24' }, facts)).toBe(false)
    expect(evaluateConditions({ field: 'account_type', op: 'in', value: ['linux', 'windows'] }, facts)).toBe(true)
    expect(evaluateConditions({ field: 'non_expiring', op: 'isTrue' }, facts)).toBe(true)
    expect(evaluateConditions({ field: 'password_age_days', op: 'gt', value: 90 }, facts)).toBe(true)
  })

  it('nested all / any / not groups', () => {
    expect(evaluateConditions({ all: [{ field: 'privilege_level', op: 'eq', value: 'root' }, { field: 'environment', op: 'eq', value: 'production' }] }, facts)).toBe(true)
    expect(evaluateConditions({ all: [{ field: 'privilege_level', op: 'eq', value: 'root' }, { field: 'environment', op: 'eq', value: 'dev' }] }, facts)).toBe(false)
    expect(evaluateConditions({ any: [{ field: 'environment', op: 'eq', value: 'dev' }, { field: 'privilege_level', op: 'eq', value: 'root' }] }, facts)).toBe(true)
    expect(evaluateConditions({ not: { field: 'account_type', op: 'eq', value: 'windows' } }, facts)).toBe(true)
  })

  it('empty conditions match everything', () => {
    expect(evaluateConditions(null, facts)).toBe(true)
    expect(evaluateConditions({ all: [] }, facts)).toBe(true)
  })
})

describe('discovery — rule matching', () => {
  const rules: RuleLike[] = [
    { id: 'r-ignore-svc', priority: 10, enabled: true, action: 'ignore', conditions: { field: 'username', op: 'startsWith', value: 'svc-' } },
    { id: 'r-onboard-root', priority: 20, enabled: true, action: 'onboard', conditions: { field: 'privilege_level', op: 'eq', value: 'root' } },
    { id: 'r-disabled', priority: 1, enabled: false, action: 'ignore', conditions: null },
    { id: 'r-catch-all', priority: 100, enabled: true, action: 'review', conditions: null }
  ]
  it('lowest-priority enabled matching rule wins; disabled ignored', () => {
    expect(matchRule(rules, { username: 'root', privilege_level: 'root' })!.id).toBe('r-onboard-root')
    expect(matchRule(rules, { username: 'svc-backup', privilege_level: 'root' })!.id).toBe('r-ignore-svc')
    expect(matchRule(rules, { username: 'alice', privilege_level: 'user' })!.id).toBe('r-catch-all')
  })
  it('detects same-priority conflicts', () => {
    const conflict = ruleConflicts([{ id: 'a', priority: 5, enabled: true, action: 'onboard', conditions: null }, { id: 'b', priority: 5, enabled: true, action: 'ignore', conditions: null }])
    expect(conflict.length).toBe(1)
  })
})

describe('discovery — helpers', () => {
  it('ipInCidr', () => {
    expect(ipInCidr('192.168.1.10', '192.168.1.0/24')).toBe(true)
    expect(ipInCidr('192.168.2.10', '192.168.1.0/24')).toBe(false)
    expect(ipInCidr('10.0.0.1', '0.0.0.0/0')).toBe(true)
  })
  it('fingerprint is stable + case-insensitive', () => {
    expect(discoveryFingerprint('s1', '10.0.0.1', 'Root')).toBe(discoveryFingerprint('s1', '10.0.0.1', 'root'))
    expect(discoveryFingerprint('s1', '10.0.0.1', 'a')).not.toBe(discoveryFingerprint('s2', '10.0.0.1', 'a'))
  })
})
