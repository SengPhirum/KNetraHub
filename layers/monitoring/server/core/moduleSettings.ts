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

/**
 * Is a window active at `now`? One-shot windows use their literal range;
 * recurring windows repeat the starts_at→ends_at span every day/week (fixed
 * period) or on the same calendar day each month (months lacking that day
 * simply have no occurrence).
 */
export function isWindowActive(now: Date, startsAt: Date, endsAt: Date, recurrence: string | null): boolean {
  if (!recurrence) return now >= startsAt && now <= endsAt
  if (now < startsAt) return false
  const durationMs = endsAt.getTime() - startsAt.getTime()
  if (recurrence === 'daily' || recurrence === 'weekly') {
    const period = recurrence === 'daily' ? 86_400_000 : 7 * 86_400_000
    const k = Math.floor((now.getTime() - startsAt.getTime()) / period)
    const occStart = startsAt.getTime() + k * period
    return now.getTime() >= occStart && now.getTime() <= occStart + durationMs
  }
  if (recurrence === 'monthly') {
    for (const offset of [0, -1]) {
      const occ = new Date(now.getFullYear(), now.getMonth() + offset, startsAt.getDate(),
        startsAt.getHours(), startsAt.getMinutes(), startsAt.getSeconds())
      if (occ.getDate() !== startsAt.getDate()) continue // month lacks this day (e.g. Feb 31st)
      if (now.getTime() >= occ.getTime() && now.getTime() <= occ.getTime() + durationMs) return true
    }
    return false
  }
  return false
}

/** Is the device inside an active maintenance window right now? */
export async function activeMaintenance(db: Pool, deviceId: number): Promise<{ windowId: number; behavior: string } | null> {
  const { rows } = await db.query(
    `SELECT w.id, w.behavior, w.starts_at, w.ends_at, w.recurrence
     FROM monitoring.maintenance_windows w
     JOIN monitoring.maintenance_targets t ON t.window_id = w.id
     WHERE (
         (w.recurrence IS NULL AND now() BETWEEN w.starts_at AND w.ends_at)
         OR (w.recurrence IS NOT NULL AND w.starts_at <= now())
       )
       AND (
         t.device_id = $1
         OR t.group_id IN (SELECT group_id FROM monitoring.device_group_members WHERE device_id = $1)
         OR t.location_id = (SELECT location_id FROM monitoring.devices WHERE id = $1)
       )
     ORDER BY (w.behavior = 'skip_polling') DESC`,
    [deviceId]
  )
  const now = new Date()
  for (const row of rows) {
    if (isWindowActive(now, new Date(row.starts_at), new Date(row.ends_at), row.recurrence)) {
      return { windowId: Number(row.id), behavior: row.behavior }
    }
  }
  return null
}
