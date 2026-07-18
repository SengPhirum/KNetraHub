import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb } from '../../../../utils/monApi'
import { getEffectiveSettings } from '../../../../core/settings'

/** GET /api/monitoring/v1/settings — effective runtime settings with provenance. */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'admin')
  const db = await monDb()
  return { items: await getEffectiveSettings(db) }
})
