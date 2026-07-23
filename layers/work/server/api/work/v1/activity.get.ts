import { getWork, requireWorkPermission } from '~~/layers/work/server/utils/workStore'

/** Workspace-wide activity trail (manager: work.audit). */
export default defineEventHandler(async (event) => {
  const { workspaceId } = await requireWorkPermission(event, 'work.audit')
  const q = getQuery(event)
  const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500)

  const where: string[] = ['a.workspace_id = $1']
  const params: unknown[] = [workspaceId]
  const arg = (value: unknown): string => { params.push(value); return `$${params.length}` }
  if (q.actor) where.push(`lower(a.actor) = lower(${arg(String(q.actor))})`)
  if (q.entity_type) where.push(`a.entity_type = ${arg(String(q.entity_type))}`)
  if (q.action) where.push(`a.action = ${arg(String(q.action))}`)
  if (q.before) where.push(`a.ts < ${arg(String(q.before))}`)

  const { rows } = await getWork().query(
    `SELECT a.*, t.name AS task_name, t.custom_id
       FROM work.activity a LEFT JOIN work.tasks t ON t.id = a.task_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.ts DESC LIMIT ${limit}`, params)
  return rows
})
