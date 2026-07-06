import { requireRole } from '~~/server/utils/auth'
import { removeStack } from '~~/layers/docker/server/utils/stack'
import { gitlabEnabled, deleteStackFile } from '~~/layers/docker/server/utils/gitlab'
import { audit } from '~~/server/utils/store'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const name = getRouterParam(event, 'name')!
  const removeFromGit = getQuery(event).git === 'true'
  const res = await removeStack(name)
  if (removeFromGit && (await gitlabEnabled())) {
    await deleteStackFile(name, `Remove ${name} via KNetraHub`, user.displayName, `${user.username}@knetrahub`).catch(() => {})
  }
  await audit({ actor: user.username, action: 'stack.remove', target: name })
  return res
})
