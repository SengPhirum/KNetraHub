import type { Pool } from 'pg'
import type { DeviceRow, EngineModule, OsDefinition } from './registry'

/**
 * Effective module enablement with LibreNMS-equivalent precedence:
 *   1. device override        (monitoring.module_settings scope='device')
 *   2. device-group override  (scope='group', any group the device is in)
 *   3. OS definition          (OsDefinition.disabledModules)
 *   4. global override        (scope='global')
 *   5. module defaultEnabled
 */
export async function resolveEnabledModules(
  db: Pool,
  device: DeviceRow,
  os: OsDefinition,
  phase: 'discovery' | 'poll',
  modules: EngineModule[]
): Promise<Map<string, { enabled: boolean; source: string }>> {
  const { rows: overrides } = await db.query(
    `SELECT scope, scope_ref, module, enabled FROM monitoring.module_settings
     WHERE phase = $1 AND (
       scope = 'global'
       OR (scope = 'os' AND scope_ref = $2)
       OR (scope = 'device' AND scope_ref = $3)
       OR (scope = 'group' AND scope_ref IN (
         SELECT group_id::text FROM monitoring.device_group_members WHERE device_id = $4
       ))
     )`,
    [phase, device.os, String(device.id), device.id]
  )

  const byScope = (scope: string) => {
    const map = new Map<string, boolean>()
    for (const row of overrides) if (row.scope === scope) map.set(row.module, row.enabled)
    return map
  }
  const deviceOv = byScope('device')
  const groupOv = byScope('group')
  const osOv = byScope('os')
  const globalOv = byScope('global')
  const osDisabled = new Set(os.disabledModules?.[phase] ?? [])

  const out = new Map<string, { enabled: boolean; source: string }>()
  for (const mod of modules) {
    if (deviceOv.has(mod.name)) out.set(mod.name, { enabled: deviceOv.get(mod.name)!, source: 'device' })
    else if (groupOv.has(mod.name)) out.set(mod.name, { enabled: groupOv.get(mod.name)!, source: 'group' })
    else if (osOv.has(mod.name)) out.set(mod.name, { enabled: osOv.get(mod.name)!, source: 'os-setting' })
    else if (osDisabled.has(mod.name)) out.set(mod.name, { enabled: false, source: 'os-definition' })
    else if (globalOv.has(mod.name)) out.set(mod.name, { enabled: globalOv.get(mod.name)!, source: 'global' })
    else out.set(mod.name, { enabled: mod.defaultEnabled, source: 'default' })
  }
  return out
}

/** Is the device inside an active maintenance window right now? */
export async function activeMaintenance(db: Pool, deviceId: number): Promise<{ windowId: number; behavior: string } | null> {
  const { rows } = await db.query(
    `SELECT w.id, w.behavior FROM monitoring.maintenance_windows w
     JOIN monitoring.maintenance_targets t ON t.window_id = w.id
     WHERE now() BETWEEN w.starts_at AND w.ends_at
       AND (
         t.device_id = $1
         OR t.group_id IN (SELECT group_id FROM monitoring.device_group_members WHERE device_id = $1)
         OR t.location_id = (SELECT location_id FROM monitoring.devices WHERE id = $1)
       )
     LIMIT 1`,
    [deviceId]
  )
  return rows[0] ? { windowId: Number(rows[0].id), behavior: rows[0].behavior } : null
}
