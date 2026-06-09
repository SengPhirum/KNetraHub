import { clearSession } from '~~/server/utils/auth'
export default defineEventHandler(async (event) => {
  clearSession(event)
  return { ok: true }
})
