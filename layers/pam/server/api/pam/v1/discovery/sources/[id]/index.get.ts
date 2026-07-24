import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.discovery.view')
  const id = getRouterParam(event, 'id')!
  const db = getPamDb()
  const source = (await db.query('SELECT * FROM pam.discovery_sources WHERE id=$1', [id])).rows[0]
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Source not found' })
  const runs = (await db.query('SELECT * FROM pam.discovery_runs WHERE source_id=$1 ORDER BY started_at DESC LIMIT 20', [id])).rows
  return { source, runs }
})
