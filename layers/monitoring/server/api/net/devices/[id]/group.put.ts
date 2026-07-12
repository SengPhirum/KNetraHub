import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Assign (or clear) a single device's group from the device Add/Edit form. Unlike
// /api/net/groups/[id]/members.put.ts (which replaces a *group's* whole member
// list), this only ever touches this one device's membership row, so it's safe
// to call from device create/update without clobbering other devices' groups.
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ group_id?: string | null }>(event)
  const db = getDb()

  await db.query('DELETE FROM net_device_groups WHERE device_id = $1', [id])
  if (body.group_id) {
    await db.query(
      'INSERT INTO net_device_groups (device_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, body.group_id]
    )
  }
  return { success: true }
})
