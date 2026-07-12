import { requireRole } from '~~/server/utils/auth'
import { useDocker, throwDockerError, dockerErrorMessage } from '~~/layers/docker/server/utils/docker'
import { audit } from '~~/server/utils/store'
import { logSystem } from '~~/server/utils/moduleLogs'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const docker = useDocker()
  const name = (await docker.getContainer(id).inspect().catch(() => null))?.Name?.replace(/^\//, '') || id

  try {
    await docker.getContainer(id).remove({ force: true })
  } catch (err: any) {
    await logSystem('docker', 'error', 'container.delete.failed',
      `${user.username} failed to remove container "${name}": ${dockerErrorMessage(err)}`)
    throwDockerError(err, `Failed to remove container "${name}"`)
  }
  await audit({ actor: user.username, action: 'container.remove', target: name })
  await logSystem('docker', 'info', 'container.removed', `${user.username} force-removed container "${name}"`)
  return { ok: true }
})
