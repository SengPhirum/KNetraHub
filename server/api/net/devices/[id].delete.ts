import { getDb } from '../../../utils/db'

// Delete a device and (via ON DELETE CASCADE) its interfaces, sensors, alerts,
// syslog, flows, backups, and group links. Used to remove decommissioned or
// mistakenly added devices.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = getDb()
  const res = await db.query('DELETE FROM net_devices WHERE id = $1', [id])
  if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Device not found' })
  return { deleted: res.rowCount }
})
