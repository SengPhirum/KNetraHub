import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { createSource } from '~~/layers/pam/server/utils/pamDiscovery'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.discovery.manage')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  const sourceType = String(body?.source_type || body?.sourceType || '').trim()
  if (!name || !sourceType) throw createError({ statusCode: 400, statusMessage: 'name and source_type are required' })
  const id = await createSource({
    name, sourceType, config: body?.config, credentialAccountId: body?.credential_account_id ?? null,
    includeScopes: body?.include_scopes, excludeScopes: body?.exclude_scopes, rateLimit: body?.rate_limit ?? null,
    enabled: body?.enabled, actor: user.username
  })
  await pamAudit(event, user, { action: 'discovery.source.create', objectType: 'discovery_source', objectId: id, severity: 'notice', details: { name, sourceType } })
  return { id }
})
