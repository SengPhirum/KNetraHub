import { requireRole } from '~~/server/utils/auth'
import { createLocalUser, audit } from '~~/server/utils/store'
import { enforcePasswordPolicy } from '~~/server/utils/passwordPolicy'
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const b = await readBody<any>(event)
  if (!b?.username || !b?.password) {
    throw createError({ statusCode: 400, statusMessage: 'Username and password are required' })
  }
  await enforcePasswordPolicy(String(b.password))
  const u = await createLocalUser(b)
  await audit({ actor: admin.username, action: 'user.create', target: u.username, detail: u.role })
  return u
})
