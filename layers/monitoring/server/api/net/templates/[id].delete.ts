import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  await getDb().query('DELETE FROM net_device_templates WHERE id = $1', [id])
  return { success: true }
})
