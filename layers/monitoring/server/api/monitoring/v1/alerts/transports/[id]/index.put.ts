import { requireMonitoring } from '../../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring, badRequest, conflict, notFound } from '../../../../../../utils/monApi'
import { encryptSecret } from '~~/server/utils/secretCrypto'
import { TRANSPORT_TYPES } from '../../../../../../../shared/constants'

/**
 * PUT /api/monitoring/v1/alerts/transports/:id — update a transport (admin).
 * Omitting `config` keeps the stored (encrypted) configuration unchanged.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)

  const sets: string[] = []
  const args: unknown[] = [id]
  const set = (col: string, value: unknown) => {
    args.push(value)
    sets.push(`${col} = $${args.length}`)
  }

  if (body?.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (!name) badRequest('name cannot be empty')
    set('name', name)
  }
  if (body?.type !== undefined) {
    if (!TRANSPORT_TYPES.includes(body.type)) badRequest(`type must be one of ${TRANSPORT_TYPES.join(', ')}`)
    set('type', body.type)
  }
  if (body?.enabled !== undefined) set('enabled', !!body.enabled)
  if (body?.is_default !== undefined) set('is_default', !!body.is_default)
  if (body?.config !== undefined && body.config !== null) {
    if (typeof body.config !== 'object') badRequest('config must be an object')
    set('config', encryptSecret(JSON.stringify(body.config)))
  }
  if (!sets.length) badRequest('nothing to update')
  set('updated_at', new Date())

  try {
    const res = await db.query(`UPDATE monitoring.alert_transports SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, args)
    if (!res.rowCount) notFound('alert transport')
  } catch (err: any) {
    if (err?.code === '23505') conflict('a transport with that name already exists')
    throw err
  }
  await auditMonitoring(user.username, 'transport.update', String(id))
  return { id, updated: true }
})
