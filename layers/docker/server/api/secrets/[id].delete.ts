import { requireRole } from '~~/server/utils/auth'
import { requireDeleteConfirm } from '~~/server/utils/deleteConfirm'
import { useDocker, throwDockerError, dockerErrorMessage } from '~~/layers/docker/server/utils/docker'
import { secretUsers, formatResourceUsers } from '~~/layers/docker/server/utils/resourceUsage'
import { audit } from '~~/server/utils/store'
import { logSystem } from '~~/server/utils/moduleLogs'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const docker = useDocker()
  const name = (await docker.getSecret(id).inspect().catch(() => null))?.Spec?.Name || id
  await requireDeleteConfirm(event, 'docker.secret', { name })

  // Refuse to delete a secret a service still references, and name the exact
  // services - Docker's own "in use" error doesn't say which.
  const users = await secretUsers(id).catch(() => [])
  if (users.length) {
    const list = formatResourceUsers(users)
    await logSystem('docker', 'error', 'secret.delete.blocked',
      `${user.username} tried to delete secret "${name}" but it is in use by: ${list}`)
    throw createError({
      statusCode: 409,
      statusMessage: `Secret "${name}" is in use by: ${list}`,
      data: { usedBy: users }
    })
  }

  try {
    await docker.getSecret(id).remove()
  } catch (err: any) {
    await logSystem('docker', 'error', 'secret.delete.failed',
      `${user.username} failed to delete secret "${name}": ${dockerErrorMessage(err)}`)
    throwDockerError(err, `Failed to delete secret "${name}"`)
  }
  await audit({ actor: user.username, action: 'secret.remove', target: name })
  await logSystem('docker', 'info', 'secret.deleted', `${user.username} deleted secret "${name}"`)
  return { ok: true }
})
