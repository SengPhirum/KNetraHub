import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { createCampaign } from '~~/layers/pam/server/utils/pamCertification'

const SCOPES = ['active_grants', 'privileged_accounts', 'jit_entitlements', 'safe_members']

/** Create a certification campaign; snapshots subjects into review items. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.certification.manage')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  const scopeType = String(body?.scope?.type || '')
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name is required' })
  if (!SCOPES.includes(scopeType)) throw createError({ statusCode: 400, statusMessage: `scope.type must be one of ${SCOPES.join(', ')}` })
  if (scopeType === 'safe_members' && !body?.scope?.safeId) throw createError({ statusCode: 400, statusMessage: 'scope.safeId is required for safe_members' })
  try {
    return await createCampaign({ name, scope: body.scope, reviewer: body?.reviewer ?? null, dueDate: body?.due_date ?? null, actor: user.username })
  } catch (err: any) {
    throw createError({ statusCode: 400, statusMessage: err?.message || 'failed to create campaign' })
  }
})
