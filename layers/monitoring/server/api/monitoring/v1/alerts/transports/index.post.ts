import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest } from '../../../../../utils/monApi'
import { encryptSecret } from '~~/server/utils/secretCrypto'
import { TRANSPORT_TYPES } from '../../../../../../shared/constants'

/** POST /api/monitoring/v1/alerts/transports — create a transport (admin tier). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)

  const name = String(body?.name ?? '').trim()
  if (!name) badRequest('name is required')
  if (!TRANSPORT_TYPES.includes(body?.type)) badRequest(`type must be one of ${TRANSPORT_TYPES.join(', ')}`)
  if (!body?.config || typeof body.config !== 'object') badRequest('config object is required')

  const res = await db.query(
    `INSERT INTO monitoring.alert_transports (name, type, enabled, is_default, config)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [name, body.type, body?.enabled !== false, !!body?.is_default, encryptSecret(JSON.stringify(body.config))]
  )
  await auditMonitoring(user.username, 'transport.create', String(res.rows[0].id), `name=${name} type=${body.type}`)
  setResponseStatus(event, 201)
  return { id: Number(res.rows[0].id) }
})
