import { getDb } from '~~/server/utils/db'
import { parseLayout } from '~~/layers/monitoring/server/utils/netDashboards'

// Lists the current user's saved /net dashboards (default first). Per-user via
// requireUser - unlike the open net/* data endpoints, dashboards are owned state.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { rows } = await getDb().query(
    'SELECT * FROM net_dashboards WHERE owner = $1 ORDER BY is_default DESC, created_at ASC',
    [user.id]
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    layout: parseLayout(r.layout),
    isDefault: r.is_default,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
})
