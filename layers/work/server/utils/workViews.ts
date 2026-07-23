/**
 * Saved-view config validation: a strict whitelist of filter/sort/display
 * keys. Unknown keys are dropped, values are type-checked and clamped —
 * config JSONB never stores arbitrary client documents.
 */

export const VIEW_TYPES = ['list', 'board', 'table', 'calendar'] as const

const strArray = (value: unknown, max = 50): string[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const out = value.map(String).filter(Boolean).slice(0, max)
  return out.length ? out : undefined
}

export function sanitizeViewConfig(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const input = raw as Record<string, unknown>
  const config: Record<string, unknown> = {}

  const filters = input.filters && typeof input.filters === 'object' && !Array.isArray(input.filters)
    ? input.filters as Record<string, unknown>
    : {}
  const cleanFilters: Record<string, unknown> = {}
  const assignees = strArray(filters.assignees)
  if (assignees) cleanFilters.assignees = assignees.map((a) => a.toLowerCase())
  const statusIds = strArray(filters.status_ids)
  if (statusIds) cleanFilters.status_ids = statusIds
  const priorities = strArray(filters.priorities, 4)?.filter((p) => ['urgent', 'high', 'normal', 'low'].includes(p))
  if (priorities?.length) cleanFilters.priorities = priorities
  const tagIds = strArray(filters.tag_ids)
  if (tagIds) cleanFilters.tag_ids = tagIds
  if (typeof filters.include_closed === 'boolean') cleanFilters.include_closed = filters.include_closed
  if (typeof filters.include_archived === 'boolean') cleanFilters.include_archived = filters.include_archived
  if (typeof filters.overdue === 'boolean') cleanFilters.overdue = filters.overdue
  if (typeof filters.q === 'string' && filters.q.trim()) cleanFilters.q = String(filters.q).trim().slice(0, 200)
  if (Object.keys(cleanFilters).length) config.filters = cleanFilters

  if (typeof input.sort === 'string' && ['order', 'created', 'updated', 'due', 'name', 'priority'].includes(input.sort)) {
    config.sort = input.sort
  }
  if (typeof input.group_by === 'string' && ['status', 'assignee', 'priority', 'none'].includes(input.group_by)) {
    config.group_by = input.group_by
  }
  const columns = strArray(input.columns, 30)
  if (columns) config.columns = columns
  if (typeof input.show_subtasks === 'boolean') config.show_subtasks = input.show_subtasks
  return config
}
