import { describe, it, expect } from 'vitest'
import { vendorAccessVerdict, shouldAutoSuspend } from '../../layers/pam/server/utils/pamVendorCore'

const future = new Date(Date.now() + 86400000).toISOString()
const past = new Date(Date.now() - 86400000).toISOString()

describe('vendor access verdict', () => {
  it('allows an active user of an active, in-contract vendor', () => {
    expect(vendorAccessVerdict({ vendorStatus: 'active', contractEnd: future, userStatus: 'active' }).allowed).toBe(true)
  })
  it('denies suspended/expired vendor, expired contract, suspended user', () => {
    expect(vendorAccessVerdict({ vendorStatus: 'suspended', userStatus: 'active' }).allowed).toBe(false)
    expect(vendorAccessVerdict({ vendorStatus: 'active', contractEnd: past, userStatus: 'active' }).reason).toContain('contract has expired')
    expect(vendorAccessVerdict({ vendorStatus: 'active', contractEnd: future, userStatus: 'suspended' }).allowed).toBe(false)
    expect(vendorAccessVerdict({ vendorStatus: 'active', contractEnd: future, userStatus: 'active', userExpiry: past }).allowed).toBe(false)
  })
  it('enforces an allowed-network list when set', () => {
    const base = { vendorStatus: 'active', contractEnd: future, userStatus: 'active', allowedNetworks: ['10.0.0.0/8'] }
    expect(vendorAccessVerdict({ ...base, ip: '10.1.2.3' }).allowed).toBe(true)
    expect(vendorAccessVerdict({ ...base, ip: '192.168.1.1' }).allowed).toBe(false)
    expect(vendorAccessVerdict({ ...base, ip: null }).allowed).toBe(false)
  })
})

describe('vendor auto-suspend triggers', () => {
  it('flags contract expiry, inactive sponsor, overdue recert', () => {
    expect(shouldAutoSuspend({ contractEnd: past })).toBe('contract expired')
    expect(shouldAutoSuspend({ sponsorActive: false })).toBe('sponsor inactive')
    expect(shouldAutoSuspend({ recertDue: past })).toBe('recertification overdue')
    expect(shouldAutoSuspend({ contractEnd: future, sponsorActive: true })).toBeNull()
  })
})
