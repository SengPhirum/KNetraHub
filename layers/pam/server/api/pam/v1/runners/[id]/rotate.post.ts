import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { rotateRunnerToken } from '~~/layers/pam/server/utils/pamRunner'

/** Rotate a runner's token. Returns the new clear token ONCE. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.connector.manage')
  const id = String(getRouterParam(event, 'id') || '')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'runner id required' })
  const rotated = await rotateRunnerToken(id)
  if (!rotated) throw createError({ statusCode: 404, statusMessage: 'Runner not found' })
  await pamAudit(event, user, { action: 'runner.rotate_token', objectType: 'runner', objectId: id, severity: 'warning' })
  return { id, tokenPrefix: rotated.tokenPrefix, token: rotated.token }
})
