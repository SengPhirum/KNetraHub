import { describe, it, expect } from 'vitest'
import {
  isWithinTimeWindow, ipInCidr, sourceNetworkAllowed, evaluateApprovals,
  selfApprovalAllowed, separationOfDutiesViolation, defaultSafePermissions
} from '../../layers/pam/server/utils/pamPolicy'

describe('PAM policy evaluators', () => {
  it('time window: no window allows all; hours are enforced in UTC', () => {
    const tue10 = new Date('2026-07-21T10:00:00Z')
    expect(isWithinTimeWindow(tue10, null)).toBe(true)
    expect(isWithinTimeWindow(tue10, { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' })).toBe(true)
    expect(isWithinTimeWindow(new Date('2026-07-21T19:30:00Z'), { start: '08:00', end: '18:00' })).toBe(false)
    expect(isWithinTimeWindow(new Date('2026-07-25T10:00:00Z'), { days: [1, 2, 3, 4, 5] })).toBe(false) // Saturday
  })

  it('time window supports wrap-past-midnight ranges', () => {
    expect(isWithinTimeWindow(new Date('2026-07-21T23:30:00Z'), { start: '22:00', end: '06:00' })).toBe(true)
    expect(isWithinTimeWindow(new Date('2026-07-21T12:00:00Z'), { start: '22:00', end: '06:00' })).toBe(false)
  })

  it('IPv4 CIDR containment', () => {
    expect(ipInCidr('10.1.2.3', '10.0.0.0/8')).toBe(true)
    expect(ipInCidr('11.1.2.3', '10.0.0.0/8')).toBe(false)
    expect(ipInCidr('192.168.1.5', '192.168.1.0/24')).toBe(true)
    expect(ipInCidr('192.168.2.5', '192.168.1.0/24')).toBe(false)
    expect(ipInCidr('8.8.8.8', '8.8.8.8')).toBe(true)
  })

  it('source-network allowlist (empty = unrestricted)', () => {
    expect(sourceNetworkAllowed('10.1.1.1', [])).toBe(true)
    expect(sourceNetworkAllowed('10.1.1.1', ['10.0.0.0/8'])).toBe(true)
    expect(sourceNetworkAllowed('172.16.0.1', ['10.0.0.0/8'])).toBe(false)
    expect(sourceNetworkAllowed(null, ['10.0.0.0/8'])).toBe(false)
  })

  it('approval evaluation: none is satisfied; a rejection fails', () => {
    expect(evaluateApprovals('none', []).satisfied).toBe(true)
    expect(evaluateApprovals('one', [{ level: 1, decision: 'rejected' }]).rejected).toBe(true)
    expect(evaluateApprovals('one', [{ level: 1, decision: 'pending' }]).satisfied).toBe(false)
    expect(evaluateApprovals('one', [{ level: 1, decision: 'approved' }]).satisfied).toBe(true)
  })

  it('multi-level requires every level satisfied in order', () => {
    const approvals = [{ level: 1, decision: 'approved' as const }, { level: 2, decision: 'pending' as const }]
    const out = evaluateApprovals('multi_level', approvals)
    expect(out.satisfied).toBe(false)
    expect(out.pendingLevel).toBe(2)
    approvals[1]!.decision = 'approved' as any
    expect(evaluateApprovals('multi_level', approvals).satisfied).toBe(true)
  })

  it('no self-approval unless explicitly allowed', () => {
    expect(selfApprovalAllowed('alice', 'bob', false)).toBe(true)
    expect(selfApprovalAllowed('alice', 'alice', false)).toBe(false)
    expect(selfApprovalAllowed('alice', 'alice', true)).toBe(true)
  })

  it('separation of duties detects a conflicting shared membership', () => {
    expect(separationOfDutiesViolation(['dev'], ['ops'], [['dev', 'ops']])).toBe(true)
    expect(separationOfDutiesViolation(['dev'], ['sec'], [['dev', 'ops']])).toBe(false)
  })

  it('safe permission presets are cumulative and sensible', () => {
    expect(defaultSafePermissions('reader')).not.toContain('reveal_credential')
    expect(defaultSafePermissions('owner')).toContain('manage_safe')
    expect(defaultSafePermissions('approver')).toContain('approve_access')
  })
})
