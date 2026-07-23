import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, loadOr404 } from '~~/layers/pam/server/utils/pamStore'
import { openSecretValue } from '~~/layers/pam/server/utils/pamVault'

/** Interactive secret reveal for an operator (pam.secret.use + reason + audit). */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.secret.use')
  const id = getRouterParam(event, 'id')!
  const secret = await loadOr404<any>('pam.secrets', id, 'Secret not found')
  if (secret.revoked || secret.deleted_at) throw createError({ statusCode: 409, statusMessage: 'Secret is revoked' })
  const body = await readBody(event).catch(() => ({}))
  const reason = String(body?.reason || '').trim()
  if (!reason) throw createError({ statusCode: 400, statusMessage: 'A reason is required' })

  const opened = await openSecretValue(id, undefined, getPamDb())
  if (!opened) throw createError({ statusCode: 409, statusMessage: 'Secret has no value version' })
  await pamAudit(event, user, { action: 'secret.reveal', objectType: 'secret', objectId: id, severity: 'high', reason, details: { version: opened.version } })
  setResponseHeaders(event, { 'cache-control': 'no-store, private', pragma: 'no-cache' })
  return { value: opened.value, version: opened.version }
})
