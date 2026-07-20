import { requireUser } from '~~/server/utils/auth'
import { hasSecurityPassword } from '~~/server/utils/store'

/** Whether the signed-in user has configured their portal security password
 *  (the second secret required to confirm critical deletes). Drives the
 *  post-login set-up prompt. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return { configured: await hasSecurityPassword(user.id) }
})
