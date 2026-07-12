import { requireRole } from '~~/server/utils/auth'
import { useDocker, throwDockerError, dockerErrorMessage } from '~~/layers/docker/server/utils/docker'
import { configUsers, formatResourceUsers } from '~~/layers/docker/server/utils/resourceUsage'
import { audit } from '~~/server/utils/store'
import { logSystem } from '~~/server/utils/moduleLogs'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const docker = useDocker()
  const name = (await docker.getConfig(id).inspect().catch(() => null))?.Spec?.Name || id

  // Refuse to delete a config a service still references, and name the exact
  // services - Docker's own "in use" error doesn't say which.
  const users = await configUsers(id).catch(() => [])
  if (users.length) {
    const list = formatResourceUsers(users)
    await logSystem('docker', 'error', 'config.delete.blocked',
      `${user.username} tried to delete config "${name}" but it is in use by: ${list}`)
    throw createError({
      statusCode: 409,
      statusMessage: `Config "${name}" is in use by: ${list}`,
      data: { usedBy: users }
    })
  }

  try {
    await docker.getConfig(id).remove()
  } catch (err: any) {
    await logSystem('docker', 'error', 'config.delete.failed',
      `${user.username} failed to delete config "${name}": ${dockerErrorMessage(err)}`)
    throwDockerError(err, `Failed to delete config "${name}"`)
  }
  await audit({ actor: user.username, action: 'config.remove', target: name })
  await logSystem('docker', 'info', 'config.deleted', `${user.username} deleted config "${name}"`)
  return { ok: true }
})
