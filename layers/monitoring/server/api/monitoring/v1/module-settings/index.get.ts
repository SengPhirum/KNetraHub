import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb } from '../../../../utils/monApi'
import { getDiscoveryModules, getPollerModules } from '../../../../core/registry'
// Module registration side-effects
import '../../../../definitions/os'
import '../../../../discovery/modules'
import '../../../../polling/modules'

/**
 * GET /api/monitoring/v1/module-settings — the discovery/poll module registry
 * plus every stored override. Optional filters: ?scope=&scope_ref=
 */
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'viewer')
  const db = await monDb()
  const query = getQuery(event)

  const where: string[] = []
  const args: unknown[] = []
  if (query.scope) {
    args.push(String(query.scope))
    where.push(`scope = $${args.length}`)
  }
  if (query.scope_ref != null) {
    args.push(String(query.scope_ref))
    where.push(`scope_ref = $${args.length}`)
  }
  const overrides = await db.query(
    `SELECT id, scope, scope_ref, phase, module, enabled FROM monitoring.module_settings
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY scope, scope_ref, phase, module`,
    args
  )

  const describe = (m: { name: string; order?: number; defaultEnabled: boolean; requiresSnmp?: boolean }) => ({
    name: m.name, order: m.order ?? 100, default_enabled: m.defaultEnabled, requires_snmp: !!m.requiresSnmp
  })
  return {
    modules: {
      discovery: getDiscoveryModules().map(describe),
      poll: getPollerModules().map(describe)
    },
    overrides: overrides.rows
  }
})
