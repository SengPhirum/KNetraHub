/**
 * Pure step-up decision (no DB/session) — unit-testable. The critical property:
 * a bearer/API token does NOT grant a blanket exemption from step-up (the prior
 * portal behavior). A non-interactive caller passes ONLY with an explicit
 * service scope for the action; otherwise every caller — session OR token —
 * must present a valid step-up proof.
 */
export interface StepUpInput {
  authType: 'bearer' | 'session'
  /** The user has configured a security password (the step-up secret). */
  securityPasswordConfigured: boolean
  providedProof: boolean
  proofValid: boolean
  /** The token carries an explicit machine scope authorizing this exact action. */
  hasServiceScope?: boolean
}

export interface StepUpVerdict { ok: boolean; statusCode?: number; code?: string; message?: string }

export function stepUpVerdict(i: StepUpInput): StepUpVerdict {
  // The ONLY non-interactive path is an explicit, narrowly-scoped machine grant —
  // never a blanket "it's a bearer token so skip step-up".
  if (i.hasServiceScope) return { ok: true }
  if (!i.securityPasswordConfigured) {
    return { ok: false, statusCode: 428, code: 'setup_required', message: 'Set up your security password before performing this action' }
  }
  if (!i.providedProof) {
    return { ok: false, statusCode: 428, code: 'stepup_required', message: 'This action requires step-up confirmation' }
  }
  if (!i.proofValid) {
    return { ok: false, statusCode: 403, code: 'stepup_failed', message: 'Step-up confirmation failed' }
  }
  return { ok: true }
}
