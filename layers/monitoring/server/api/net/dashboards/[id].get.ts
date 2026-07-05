import { getDb } from '~~/server/utils/db'
import { parseLayout } from '~~/layers/monitoring/server/utils/netDashboards'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const { rows } = await getDb().query(
    'SELECT * FROM net_dashboards WHERE id = $1 AND owner = $2',
    [id, user.id]
  )
  const r = rows[0]
  if (!r) throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })
  return { id: r.id, name: r.name, layout: parseLayout(r.layout), isDefault: r.is_default, createdAt: r.created_at, updatedAt: r.updated_at }
})
