/**
 * Pure JIT entitlement state machine (spec §9). No DB/IO so it is unit-tested.
 * A JIT entitlement never reaches `revoked` until the target confirms removal
 * (the driver only transitions revoking→revoked after verifyRevoked passes).
 */
export const JIT_STATES = [
  'requested', 'approved', 'provisioning', 'active', 'renewing',
  'revoking', 'revoked', 'provision_failed', 'revoke_failed', 'reconciliation_required'
] as const
export type JitState = typeof JIT_STATES[number]

const TRANSITIONS: Record<JitState, JitState[]> = {
  requested: ['approved', 'revoked'],
  approved: ['provisioning', 'revoked'],
  provisioning: ['active', 'provision_failed'],
  provision_failed: ['provisioning', 'revoked'],
  active: ['renewing', 'revoking', 'reconciliation_required'],
  renewing: ['active', 'revoking'],
  revoking: ['revoked', 'revoke_failed'],
  revoke_failed: ['revoking', 'reconciliation_required', 'revoked'],
  reconciliation_required: ['revoking', 'revoked'],
  revoked: []
}

export function canTransition(from: JitState, to: JitState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function isActive(s: JitState): boolean { return s === 'active' || s === 'renewing' }
export function isTerminal(s: JitState): boolean { return s === 'revoked' }

/** Whether an entitlement in this state should be swept for revocation once expired. */
export function needsRevocation(s: JitState): boolean {
  return ['active', 'renewing', 'revoke_failed', 'reconciliation_required', 'provision_failed'].includes(s)
}
