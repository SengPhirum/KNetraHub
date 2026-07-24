import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { invite } from '~~/layers/pam/server/utils/pamVendor'

/** Invite a vendor user. The invitation token is returned ONCE (only its hash
 * is stored) — surface it in a one-time dialog, never persist it. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.safe.manage')
  const body = await readBody(event)
  const vendorId = String(body?.vendor_id || '').trim()
  const email = String(body?.email || '').trim()
  if (!vendorId || !email) throw createError({ statusCode: 400, statusMessage: 'vendor_id and email are required' })
  const ttl = Math.max(3600, Number(body?.ttl_seconds) || 7 * 86400)
  const res = await invite(vendorId, email, ttl, user.username)
  await pamAudit(event, user, { action: 'vendor.invite', objectType: 'vendor', objectId: vendorId, severity: 'notice', details: { email } })
  return { invitationId: res.invitationId, token: res.token }
})
