import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { decideItem } from '~~/layers/pam/server/utils/pamCertification'

/**
 * Certify / revoke / delegate a certification item. A "revoked" decision
 * performs the real enforcement (revoke grant/JIT, disable account, remove
 * safe membership) and is recorded in the audit trail.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.certification.manage')
  const id = getRouterParam(event, 'id')!
  const itemId = getRouterParam(event, 'itemId')!
  const body = await readBody(event)
  const decision = String(body?.decision || '')
  try {
    return await decideItem(id, itemId, { decision, comment: body?.comment ?? null, reviewer: user.username })
  } catch (err: any) {
    throw createError({ statusCode: 400, statusMessage: err?.message || 'failed to record decision' })
  }
})
