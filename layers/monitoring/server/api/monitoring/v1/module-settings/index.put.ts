import { requireMonitoring } from '../../../../utils/monitoringAuth'
import { monDb, auditMonitoring, badRequest } from '../../../../utils/monApi'
import { getDiscoveryModules, getPollerModules } from '../../../../core/registry'
// Module registration side-effects
import '../../../../definitions/os'
import '../../../../discovery/modules'
import '../../../../polling/modules'

const SCOPES = ['global', 'os', 'group', 'device']

/**
 * PUT /api/monitoring/v1/module-settings — upsert/remove module overrides (admin).
 * Body: { changes: [{ scope, scope_ref?, phase, module, enabled: boolean|null }] }
 * enabled=null removes the override (reverts to the next precedence level).
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'admin')
  const db = await monDb()
  const body = await readBody(event)
  const changes = Array.isArray(body?.changes) ? body.changes : null
  if (!changes || !changes.length) badRequest('changes array is required')

  const known = {
    discovery: new Set(getDiscoveryModules().map((m) => m.name)),
    poll: new Set(getPollerModules().map((m) => m.name))
  }

  const applied: string[] = []
  for (const change of changes) {
    const scope = String(change?.scope ?? '')
    if (!SCOPES.includes(scope)) badRequest(`invalid scope "${scope}"`)
    const scopeRef = scope === 'global' ? '' : String(change?.scope_ref ?? '').trim()
    if (scope !== 'global' && !scopeRef) badRequest(`${scope} scope requires scope_ref`)
    if ((scope === 'group' || scope === 'device') && !Number.isInteger(Number(scopeRef))) badRequest(`${scope} scope_ref must be an id`)
    const phase = String(change?.phase ?? '')
    if (phase !== 'discovery' && phase !== 'poll') badRequest('phase must be discovery or poll')
    const module = String(change?.module ?? '')
    if (!known[phase].has(module)) badRequest(`unknown ${phase} module "${module}"`)

    if (change?.enabled == null) {
      await db.query(
        `DELETE FROM monitoring.module_settings WHERE scope = $1 AND scope_ref = $2 AND phase = $3 AND module = $4`,
        [scope, scopeRef, phase, module]
      )
      applied.push(`${scope}/${scopeRef}/${phase}/${module}=inherit`)
    } else {
      await db.query(
        `INSERT INTO monitoring.module_settings (scope, scope_ref, phase, module, enabled) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (scope, scope_ref, phase, module) DO UPDATE SET enabled = $5`,
        [scope, scopeRef, phase, module, !!change.enabled]
      )
      applied.push(`${scope}/${scopeRef}/${phase}/${module}=${!!change.enabled}`)
    }
  }
  await auditMonitoring(user.username, 'modules.update', 'module-settings', applied.join(' '))
  return { updated: applied.length }
})
