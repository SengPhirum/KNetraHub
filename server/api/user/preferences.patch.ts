export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ theme?: string; refreshInterval?: number; density?: string }>(event)
  return updateUserPreferences(user.id, body as any)
})
