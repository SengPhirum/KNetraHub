import { getDb } from '~~/server/utils/db'
import { serializeLayout } from '~~/layers/monitoring/server/utils/netDashboards'

// Updates a dashboard's name / layout / default flag, scoped to its owner so a
// user can only edit their own.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ name?: string; layout?: unknown; isDefault?: boolean }>(event)
  const db = getDb()

  const { rows } = await db.query('SELECT id FROM net_dashboards WHERE id = $1 AND owner = $2', [id, user.id])
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })

  if (body.isDefault === true) {
    await db.query('UPDATE net_dashboards SET is_default = false WHERE owner = $1', [user.id])
  }

  const fields: string[] = []
  const vals: unknown[] = []
  if (body.name !== undefined) { fields.push(`name = $${fields.length + 1}`); vals.push(String(body.name).slice(0, 120)) }
  if (body.layout !== undefined) { fields.push(`layout = $${fields.length + 1}`); vals.push(serializeLayout(body.layout)) }
  if (body.isDefault !== undefined) { fields.push(`is_default = $${fields.length + 1}`); vals.push(body.isDefault === true) }
  fields.push(`updated_at = $${fields.length + 1}`); vals.push(new Date().toISOString())

  vals.push(id, user.id)
  await db.query(
    `UPDATE net_dashboards SET ${fields.join(', ')} WHERE id = $${vals.length - 1} AND owner = $${vals.length}`,
    vals
  )

  return { success: true }
})
