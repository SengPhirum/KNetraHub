import { requirePamPermission, assertSafePermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { bulkAction } from '~~/layers/pam/server/utils/pamDiscovery'

/** Bulk onboard / ignore / review of pending discovered accounts. */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePamPermission(event, 'pam.discovery.run')
  const body = await readBody(event)
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map((x: unknown) => String(x)) : []
  const action = String(body?.action || '')
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'ids are required' })
  if (!['onboard', 'ignore', 'review'].includes(action)) throw createError({ statusCode: 400, statusMessage: 'invalid action' })
  if (action === 'onboard') {
    const safeId = String(body?.safe_id || '')
    if (!safeId) throw createError({ statusCode: 400, statusMessage: 'safe_id is required to onboard' })
    await assertSafePermission(user, tier, safeId, 'add_account')
    const res = await bulkAction(ids, 'onboard', { safeId, platformId: body?.platform_id ?? null, owner: body?.owner ?? null, createdBy: user.username })
    await pamAudit(event, user, { action: 'discovery.bulk.onboard', objectType: 'discovered_accounts', objectId: safeId, safeId, severity: 'notice', details: { count: res.affected } })
    return res
  }
  const res = await bulkAction(ids, action as 'ignore' | 'review', { reason: body?.reason, createdBy: user.username })
  await pamAudit(event, user, { action: `discovery.bulk.${action}`, objectType: 'discovered_accounts', severity: 'notice', details: { count: res.affected } })
  return res
})
