export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return getUserPreferences(user.id)
})
