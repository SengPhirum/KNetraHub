import { requireWork } from '~~/layers/work/server/utils/workStore'
import { queryTasks } from '~~/layers/work/server/utils/workTasks'

/** My Tasks buckets: overdue, today, upcoming, unscheduled, recently done. */
export default defineEventHandler(async (event) => {
  const { user, tier, workspaceId } = await requireWork(event)
  const base = { assignee: user.username, topLevelOnly: false, limit: 200 }

  const [open, done] = await Promise.all([
    queryTasks(user, tier, workspaceId, { ...base, excludeDone: true, sort: 'due' }),
    queryTasks(user, tier, workspaceId, { ...base, sort: 'updated', limit: 20 })
  ])

  const now = Date.now()
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)

  const overdue: any[] = []
  const today: any[] = []
  const upcoming: any[] = []
  const unscheduled: any[] = []
  for (const task of open.items) {
    if (!task.due_at) unscheduled.push(task)
    else if (Date.parse(task.due_at) < now && new Date(task.due_at).toDateString() !== new Date().toDateString()) overdue.push(task)
    else if (Date.parse(task.due_at) <= endOfToday.getTime()) today.push(task)
    else upcoming.push(task)
  }
  const recentlyDone = done.items.filter((t) => t.completed_at && now - Date.parse(t.completed_at) < 7 * 86_400_000)

  return { overdue, today, upcoming, unscheduled, recently_done: recentlyDone, total_open: open.total }
})
