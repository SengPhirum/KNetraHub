import { requireRole } from '~~/server/utils/auth'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'
import { removeStack } from '~~/layers/docker/server/utils/stack'
import { gitlabEnabled, deleteStackFile } from '~~/layers/docker/server/utils/gitlab'
import { deleteStackHistory } from '~~/layers/docker/server/utils/stackHistory'
import { audit } from '~~/server/utils/store'
import { fireAlert } from '~~/server/utils/alertNotify'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  await requirePasswordConfirm(event)
  const name = getRouterParam(event, 'name')!
  // ?git=true - also erase the stack from version control (GitLab file AND
  // local history rows), not just stop its services.
  const removeFromGit = getQuery(event).git === 'true'
  const res = await removeStack(name)
  if (removeFromGit) {
    if (await gitlabEnabled()) {
      await deleteStackFile(name, `Remove ${name} via KNetraHub`, user.displayName, `${user.username}@knetrahub`).catch(() => {})
    }
    await deleteStackHistory(name).catch(() => 0)
  }
  await audit({ actor: user.username, action: 'stack.remove', target: name })
  await fireAlert({
    ruleType: 'stack_removed',
    target: name,
    severity: 'warning',
    vars: { target: name, actor: user.username, services: String(res.removedServices), time: new Date().toISOString() }
  })
  return res
})
