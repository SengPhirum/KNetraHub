import { ipInCidr } from './pamDiscoveryCore'

/**
 * Pure vendor-access decision (spec §10). A vendor user may access only while
 * the vendor is active AND within contract dates AND the user is active/not
 * expired AND (if configured) from an allowed source network. No DB/IO — unit
 * tested. Vendors never receive target passwords; access is browser-only +
 * recorded, enforced by the session layer once this verdict allows.
 */
export interface VendorAccessInput {
  vendorStatus: string
  contractStart?: string | null
  contractEnd?: string | null
  userStatus: string
  userExpiry?: string | null
  allowedNetworks?: string[] | null
  ip?: string | null
  at?: number
}

export function vendorAccessVerdict(i: VendorAccessInput): { allowed: boolean; reason: string } {
  const now = i.at ?? Date.now()
  if (i.vendorStatus !== 'active') return { allowed: false, reason: `vendor organization is ${i.vendorStatus}` }
  if (i.contractStart && Date.parse(i.contractStart) > now) return { allowed: false, reason: 'vendor contract has not started' }
  if (i.contractEnd && Date.parse(i.contractEnd) < now) return { allowed: false, reason: 'vendor contract has expired' }
  if (i.userStatus !== 'active') return { allowed: false, reason: `vendor user is ${i.userStatus}` }
  if (i.userExpiry && Date.parse(i.userExpiry) < now) return { allowed: false, reason: 'vendor user access has expired' }
  const nets = i.allowedNetworks || []
  if (nets.length) {
    if (!i.ip || !nets.some((c) => ipInCidr(i.ip!, c))) return { allowed: false, reason: 'source network not permitted for this vendor' }
  }
  return { allowed: true, reason: 'ok' }
}

/** Reasons a vendor org should be auto-suspended (contract/sponsor/recert). */
export function shouldAutoSuspend(vendor: { contractEnd?: string | null; sponsorActive?: boolean; recertDue?: string | null }, at = Date.now()): string | null {
  if (vendor.contractEnd && Date.parse(vendor.contractEnd) < at) return 'contract expired'
  if (vendor.sponsorActive === false) return 'sponsor inactive'
  if (vendor.recertDue && Date.parse(vendor.recertDue) < at) return 'recertification overdue'
  return null
}
