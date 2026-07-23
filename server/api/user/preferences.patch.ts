export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ theme?: string; refreshInterval?: number; density?: string; lists?: Record<string, any>; notifications?: Record<string, boolean | string>; dashboards?: Record<string, any>; appOrder?: string[] }>(event)
  return updateUserPreferences(user.id, body as any)
})
