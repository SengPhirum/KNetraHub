import { requireRole } from '~~/server/utils/auth'
import { requireDeleteConfirm } from '~~/server/utils/deleteConfirm'
import { useDocker, throwDockerError, dockerErrorMessage } from '~~/layers/docker/server/utils/docker'
import { audit } from '~~/server/utils/store'
import { logSystem } from '~~/server/utils/moduleLogs'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const docker = useDocker()
  const info = await docker.getService(id).inspect().catch(() => null)
  const name = info?.Spec?.Name || id
  await requireDeleteConfirm(event, 'docker.service', { name })

  try {
    await docker.getService(id).remove()
  } catch (err: any) {
    await logSystem('docker', 'error', 'service.delete.failed',
      `${user.username} failed to delete service "${name}": ${dockerErrorMessage(err)}`)
    throwDockerError(err, `Failed to delete service "${name}"`)
  }
  await audit({ actor: user.username, action: 'service.remove', target: name })
  await logSystem('docker', 'info', 'service.deleted', `${user.username} deleted service "${name}"`)
  return { ok: true }
})
