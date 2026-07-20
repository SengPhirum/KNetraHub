import { requireRole } from '~~/server/utils/auth'
import { requireDeleteConfirm } from '~~/server/utils/deleteConfirm'
import { useDocker, throwDockerError, dockerErrorMessage } from '~~/layers/docker/server/utils/docker'
import { audit } from '~~/server/utils/store'
import { logSystem } from '~~/server/utils/moduleLogs'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const id = getRouterParam(event, 'id')!
  const force = getQuery(event).force === 'true'
  const docker = useDocker()
  const hostname = (await docker.getNode(id).inspect().catch(() => null))?.Description?.Hostname || id
  await requireDeleteConfirm(event, 'docker.node', { name: hostname })

  try {
    await docker.getNode(id).remove({ force })
  } catch (err: any) {
    // Typically "node is not down and can't be removed" for an active node.
    await logSystem('docker', 'error', 'node.delete.failed',
      `${user.username} failed to remove node "${hostname}": ${dockerErrorMessage(err)}`)
    throwDockerError(err, `Failed to remove node "${hostname}"`)
  }
  await audit({ actor: user.username, action: 'node.remove', target: hostname })
  await logSystem('docker', 'info', 'node.removed', `${user.username} removed node "${hostname}"${force ? ' (forced)' : ''}`)
  return { ok: true }
})
