import { describe, it, expect } from 'vitest'
import { tallyItems, deriveStatus, itemsFromRows, isValidDecision } from '../../layers/pam/server/utils/pamCertificationCore'

describe('tallyItems', () => {
  it('counts each decision bucket', () => {
    const c = tallyItems([{ decision: 'pending' }, { decision: 'certified' }, { decision: 'revoked' }, { decision: 'certified' }, { decision: 'delegated' }])
    expect(c).toEqual({ total: 5, pending: 1, certified: 2, revoked: 1, delegated: 1 })
  })
})

describe('deriveStatus', () => {
  const now = '2026-07-24T00:00:00Z'
  it('completed when empty or fully decided', () => {
    expect(deriveStatus({ total: 0, pending: 0, certified: 0, revoked: 0, delegated: 0 }, null, now)).toBe('completed')
    expect(deriveStatus({ total: 2, pending: 0, certified: 1, revoked: 1, delegated: 0 }, null, now)).toBe('completed')
  })
  it('open when nothing decided, in_progress when partial', () => {
    expect(deriveStatus({ total: 2, pending: 2, certified: 0, revoked: 0, delegated: 0 }, null, now)).toBe('open')
    expect(deriveStatus({ total: 2, pending: 1, certified: 1, revoked: 0, delegated: 0 }, null, now)).toBe('in_progress')
  })
  it('overdue when past due and not complete', () => {
    expect(deriveStatus({ total: 2, pending: 2, certified: 0, revoked: 0, delegated: 0 }, '2020-01-01T00:00:00Z', now)).toBe('overdue')
  })
})

describe('itemsFromRows', () => {
  it('builds grant items with a readable label', () => {
    const items = itemsFromRows({ type: 'active_grants' }, [{ id: 'g1', grantee: 'alice', account_name: 'root@db', action: 'connect' }])
    expect(items[0]).toEqual({ subjectType: 'grant', subjectId: 'g1', subjectLabel: 'alice → root@db (connect)' })
  })
  it('builds privileged-account items', () => {
    const items = itemsFromRows({ type: 'privileged_accounts' }, [{ id: 'a1', name: 'root', criticality: 'critical', safe_name: 'Prod' }])
    expect(items[0].subjectType).toBe('account')
    expect(items[0].subjectLabel).toContain('critical')
  })
})

describe('isValidDecision', () => {
  it('accepts terminal decisions only', () => {
    expect(isValidDecision('certified')).toBe(true)
    expect(isValidDecision('revoked')).toBe(true)
    expect(isValidDecision('delegated')).toBe(true)
    expect(isValidDecision('pending')).toBe(false)
    expect(isValidDecision('bogus')).toBe(false)
  })
})
