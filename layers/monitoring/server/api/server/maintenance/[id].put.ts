import { getDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const b = await readBody<{ name?: string; active_since?: string; active_till?: string; host_ids?: string[]; group_ids?: string[]; description?: string }>(event)
  const name = (b.name || '').trim()
  if (!name || !b.active_since || !b.active_till) throw createError({ statusCode: 400, statusMessage: 'Name, start and end are required' })
  const db = getDb()
  const res = await db.query(
    `UPDATE server_maintenance SET name=$1, active_since=$2, active_till=$3, host_ids=$4, group_ids=$5, description=$6 WHERE id=$7`,
    [name.slice(0, 160), new Date(b.active_since).toISOString(), new Date(b.active_till).toISOString(),
      JSON.stringify((b.host_ids || []).filter((x) => typeof x === 'string')),
      JSON.stringify((b.group_ids || []).filter((x) => typeof x === 'string')),
      (b.description || '').slice(0, 500) || null, id]
  )
  if (!res.rowCount) throw createError({ statusCode: 404, statusMessage: 'Maintenance not found' })
  return { success: true }
})
