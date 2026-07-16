import { requireMonitoring } from '../../../../../../utils/monitoringAuth'
import { monDb, idParam, auditMonitoring } from '../../../../../../utils/monApi'
import { testTransport } from '../../../../../../alerting/transports'

/** POST /api/monitoring/v1/alerts/transports/:id/test — send a test message (operator). */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const id = idParam(event)
  const result = await testTransport(db, id)
  await auditMonitoring(user.username, 'transport.test', String(id), result.ok ? 'ok' : `failed: ${result.error}`)
  return result
})
