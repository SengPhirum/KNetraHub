import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { updateSource } from '~~/layers/pam/server/utils/pamDiscovery'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.discovery.manage')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  await updateSource(id, {
    name: body?.name, sourceType: body?.source_type, config: body?.config,
    credentialAccountId: body?.credential_account_id, includeScopes: body?.include_scopes,
    excludeScopes: body?.exclude_scopes, rateLimit: body?.rate_limit, enabled: body?.enabled, actor: user.username
  })
  await pamAudit(event, user, { action: 'discovery.source.update', objectType: 'discovery_source', objectId: id, severity: 'notice' })
  return { ok: true }
})
