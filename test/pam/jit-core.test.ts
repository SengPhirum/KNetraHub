import { describe, it, expect } from 'vitest'
import { canTransition, isActive, isTerminal, needsRevocation, JIT_STATES } from '../../layers/pam/server/utils/pamJitCore'

describe('JIT state machine', () => {
  it('allows the lifecycle path and blocks illegal jumps', () => {
    expect(canTransition('requested', 'approved')).toBe(true)
    expect(canTransition('approved', 'provisioning')).toBe(true)
    expect(canTransition('provisioning', 'active')).toBe(true)
    expect(canTransition('active', 'revoking')).toBe(true)
    expect(canTransition('revoking', 'revoked')).toBe(true)
    // Illegal: cannot jump straight to active or revoked.
    expect(canTransition('requested', 'active')).toBe(false)
    expect(canTransition('active', 'revoked')).toBe(false) // must go through revoking (verify)
    expect(canTransition('revoked', 'active')).toBe(false)
  })
  it('models failure + reconciliation paths', () => {
    expect(canTransition('provisioning', 'provision_failed')).toBe(true)
    expect(canTransition('revoking', 'revoke_failed')).toBe(true)
    expect(canTransition('revoke_failed', 'reconciliation_required')).toBe(true)
  })
  it('classifies states', () => {
    expect(isActive('active')).toBe(true)
    expect(isTerminal('revoked')).toBe(true)
    expect(needsRevocation('active')).toBe(true)
    expect(needsRevocation('revoked')).toBe(false)
    expect(JIT_STATES.length).toBe(10)
  })
})
