import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  const db = getDb()

  const { rows } = await db.query(
    'DELETE FROM net_dashboards WHERE id = $1 AND owner = $2 RETURNING is_default',
    [id, user.id]
  )
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Dashboard not found' })

  // If we removed the default, promote the user's oldest remaining dashboard so
  // they always have a default to land on.
  if (rows[0].is_default) {
    await db.query(
      `UPDATE net_dashboards SET is_default = true
       WHERE id = (SELECT id FROM net_dashboards WHERE owner = $1 ORDER BY created_at ASC LIMIT 1)`,
      [user.id]
    )
  }

  return { success: true }
})
