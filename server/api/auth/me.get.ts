import { readSession } from '~~/server/utils/auth'
export default defineEventHandler(async (event) => {
  const user = await readSession(event)
  return { user }
})
