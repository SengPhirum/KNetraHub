import { describe, it, expect } from 'vitest'
import { stepUpVerdict } from '../../layers/pam/server/utils/pamStepUpCore'

describe('PAM step-up decision (bearer bypass removed)', () => {
  it('a bearer token WITHOUT proof is NOT exempt — step-up still required (regression)', () => {
    const v = stepUpVerdict({ authType: 'bearer', securityPasswordConfigured: true, providedProof: false, proofValid: false })
    expect(v.ok).toBe(false)
    expect(v.statusCode).toBe(428)
    expect(v.code).toBe('stepup_required')
  })
  it('a bearer token WITH a valid proof passes (secret required, not identity)', () => {
    expect(stepUpVerdict({ authType: 'bearer', securityPasswordConfigured: true, providedProof: true, proofValid: true }).ok).toBe(true)
  })
  it('an explicit machine service scope is the only non-interactive pass', () => {
    expect(stepUpVerdict({ authType: 'bearer', securityPasswordConfigured: false, providedProof: false, proofValid: false, hasServiceScope: true }).ok).toBe(true)
  })
  it('session paths behave as expected', () => {
    expect(stepUpVerdict({ authType: 'session', securityPasswordConfigured: false, providedProof: false, proofValid: false }).code).toBe('setup_required')
    expect(stepUpVerdict({ authType: 'session', securityPasswordConfigured: true, providedProof: false, proofValid: false }).code).toBe('stepup_required')
    expect(stepUpVerdict({ authType: 'session', securityPasswordConfigured: true, providedProof: true, proofValid: false }).code).toBe('stepup_failed')
    expect(stepUpVerdict({ authType: 'session', securityPasswordConfigured: true, providedProof: true, proofValid: true }).ok).toBe(true)
  })
})
