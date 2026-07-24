import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { activateVersion } from '~~/layers/pam/server/utils/pamSecrets'

/** Roll back / activate a specific secret version. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.secret.manage')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const version = Number(body?.version)
  if (!Number.isInteger(version) || version < 1) throw createError({ statusCode: 400, statusMessage: 'version is required' })
  await activateVersion(id, version, user.username)
  await pamAudit(event, user, { action: 'secret.rollback', objectType: 'secret', objectId: id, severity: 'warning', details: { version } })
  return { ok: true, activeVersion: version }
})
