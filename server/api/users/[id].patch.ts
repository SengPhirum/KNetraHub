import { requireRole } from '~~/server/utils/auth'
import { updateUser, audit } from '~~/server/utils/store'
import { enforcePasswordPolicy } from '~~/server/utils/passwordPolicy'
export default defineEventHandler(async (event) => {
  const admin = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  if (typeof body?.password === 'string' && body.password) await enforcePasswordPolicy(body.password)
  const u = await updateUser(id, body)
  await audit({ actor: admin.username, action: 'user.update', target: u.username })
  return u
})
