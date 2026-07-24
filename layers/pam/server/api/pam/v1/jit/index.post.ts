import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { requestJit, provisionJit } from '~~/layers/pam/server/utils/pamJit'

/** Request a JIT entitlement (and optionally provision it immediately). */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.request.create')
  const body = await readBody(event)
  const entitlementType = String(body?.entitlement_type || '').trim()
  const target = String(body?.target || '').trim()
  const principal = String(body?.principal || '').trim()
  if (!entitlementType || !target || !principal) throw createError({ statusCode: 400, statusMessage: 'entitlement_type, target and principal are required' })
  const ttlSeconds = Math.max(60, Number(body?.ttl_seconds) || 3600)
  const id = await requestJit({
    entitlementType, provider: body?.provider, target, principal, config: body?.config,
    scope: body?.scope ?? null, ttlSeconds, grantId: body?.grant_id ?? null, accountId: body?.account_id ?? null, requestedBy: user.username
  })
  await pamAudit(event, user, { action: 'jit.request', objectType: 'jit', objectId: id, severity: 'notice', details: { entitlementType, target, principal } })
  let provision
  if (body?.provision === true) provision = await provisionJit(id)
  return { id, provision }
})
