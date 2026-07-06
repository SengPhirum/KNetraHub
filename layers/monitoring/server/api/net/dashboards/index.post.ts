import { getDb } from '~~/server/utils/db'
import { serializeLayout } from '~~/layers/monitoring/server/utils/netDashboards'
import { nanoid } from 'nanoid'

// Creates a dashboard for the current user (typically cloned from a template).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ name?: string; layout?: unknown; isDefault?: boolean }>(event)
  const db = getDb()
  const id = nanoid()
  const now = new Date().toISOString()

  // First dashboard a user creates becomes their default automatically.
  const { rows: existing } = await db.query('SELECT COUNT(*)::int AS n FROM net_dashboards WHERE owner = $1', [user.id])
  const isDefault = body.isDefault === true || existing[0].n === 0
  if (isDefault) {
    await db.query('UPDATE net_dashboards SET is_default = false WHERE owner = $1', [user.id])
  }

  await db.query(
    `INSERT INTO net_dashboards (id, owner, name, layout, is_default, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    [id, user.id, (body.name || 'My Dashboard').slice(0, 120), serializeLayout(body.layout), isDefault, now]
  )

  return { id }
})
