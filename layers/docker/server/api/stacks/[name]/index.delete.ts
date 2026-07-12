import { requireRole } from '~~/server/utils/auth'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'
import { removeStack } from '~~/layers/docker/server/utils/stack'
import { gitlabEnabled, deleteStackFile } from '~~/layers/docker/server/utils/gitlab'
import { deleteStackHistory } from '~~/layers/docker/server/utils/stackHistory'
import { audit } from '~~/server/utils/store'
import { fireAlert } from '~~/server/utils/alertNotify'
import { logSystem } from '~~/server/utils/moduleLogs'
import { throwDockerError, dockerErrorMessage } from '~~/layers/docker/server/utils/docker'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  await requirePasswordConfirm(event)
  const name = getRouterParam(event, 'name')!
  // ?git=true - also erase the stack from version control (GitLab file AND
  // local history rows), not just stop its services.
  const removeFromGit = getQuery(event).git === 'true'
  const res = await removeStack(name).catch(async (err: any) => {
    await logSystem('docker', 'error', 'stack.delete.failed',
      `${user.username} failed to remove stack "${name}": ${dockerErrorMessage(err)}`)
    throwDockerError(err, `Failed to remove stack "${name}"`)
  })
  if (removeFromGit) {
    if (await gitlabEnabled()) {
      await deleteStackFile(name, `Remove ${name} via KNetraHub`, user.displayName, `${user.username}@knetrahub`).catch(() => {})
    }
    await deleteStackHistory(name).catch(() => 0)
  }
  await audit({ actor: user.username, action: 'stack.remove', target: name })
  await logSystem('docker', 'info', 'stack.removed',
    `${user.username} removed stack "${name}" (${res.removedServices} service(s), ${res.removedNetworks} network(s)${removeFromGit ? ', erased from version control' : ''})`)
  await fireAlert({
    ruleType: 'stack_removed',
    target: name,
    severity: 'warning',
    vars: { target: name, actor: user.username, services: String(res.removedServices), time: new Date().toISOString() }
  })
  return res
})
