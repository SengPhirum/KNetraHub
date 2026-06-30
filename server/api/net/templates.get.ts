import { getDb } from '../../utils/db'

// Device onboarding templates (saved defaults applied when adding a device).
export default defineEventHandler(async () => {
  const db = getDb()
  const res = await db.query('SELECT * FROM net_device_templates ORDER BY name ASC')
  return res.rows
})
