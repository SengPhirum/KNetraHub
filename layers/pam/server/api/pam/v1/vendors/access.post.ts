import { requirePamPermission, clientIp } from '~~/layers/pam/server/utils/pamStore'
import { checkAccess } from '~~/layers/pam/server/utils/pamVendor'

/** Evaluate whether a vendor user may currently access (contract/status/network). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.safe.manage')
  const body = await readBody(event)
  const vendorUserId = String(body?.vendor_user_id || '').trim()
  if (!vendorUserId) throw createError({ statusCode: 400, statusMessage: 'vendor_user_id is required' })
  return checkAccess(vendorUserId, { ip: body?.ip || clientIp(event) })
})
