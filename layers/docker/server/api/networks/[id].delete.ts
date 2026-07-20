import { requireRole } from '~~/server/utils/auth'
import { requireDeleteConfirm } from '~~/server/utils/deleteConfirm'
import { useDocker, throwDockerError, dockerErrorMessage } from '~~/layers/docker/server/utils/docker'
import { networkUsers, formatResourceUsers } from '~~/layers/docker/server/utils/resourceUsage'
import { audit } from '~~/server/utils/store'
import { logSystem } from '~~/server/utils/moduleLogs'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const docker = useDocker()
  const name = (await docker.getNetwork(id).inspect().catch(() => null))?.Name || id
  await requireDeleteConfirm(event, 'docker.network', { name })

  // Refuse to delete a network something is still attached to, and name the
  // exact users - Docker's own "in use" error doesn't say who.
  const users = await networkUsers(id).catch(() => [])
  if (users.length) {
    const list = formatResourceUsers(users)
    await logSystem('docker', 'error', 'network.delete.blocked',
      `${user.username} tried to delete network "${name}" but it is in use by: ${list}`)
    throw createError({
      statusCode: 409,
      statusMessage: `Network "${name}" is in use by: ${list}`,
      data: { usedBy: users }
    })
  }

  try {
    await docker.getNetwork(id).remove()
  } catch (err: any) {
    await logSystem('docker', 'error', 'network.delete.failed',
      `${user.username} failed to delete network "${name}": ${dockerErrorMessage(err)}`)
    throwDockerError(err, `Failed to delete network "${name}"`)
  }
  await audit({ actor: user.username, action: 'network.remove', target: name })
  await logSystem('docker', 'info', 'network.deleted', `${user.username} deleted network "${name}"`)
  return { ok: true }
})
