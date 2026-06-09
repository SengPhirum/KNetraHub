import { requireRole } from '~~/server/utils/auth'
import { createLocalUser, audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const b = await readBody<any>(event)
  const u = await createLocalUser(b)
  await audit({ actor: admin.username, action: 'user.create', target: u.username, detail: u.role })
  return u
})
