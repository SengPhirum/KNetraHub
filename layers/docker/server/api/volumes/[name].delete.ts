import { requireRole } from '~~/server/utils/auth'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'
import { useDocker, throwDockerError, dockerErrorMessage } from '~~/layers/docker/server/utils/docker'
import { volumeUsers, formatResourceUsers } from '~~/layers/docker/server/utils/resourceUsage'
import { audit } from '~~/server/utils/store'
import { logSystem } from '~~/server/utils/moduleLogs'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'operator')
  await requirePasswordConfirm(event)
  const name = getRouterParam(event, 'name')!

  // Refuse to delete a volume something still mounts, and name the exact
  // users - Docker's own "volume is in use" error only lists container IDs.
  // Even `force` can't remove a mounted volume, so the check applies always.
  const users = await volumeUsers(name).catch(() => [])
  if (users.length) {
    const list = formatResourceUsers(users)
    await logSystem('docker', 'error', 'volume.delete.blocked',
      `${user.username} tried to delete volume "${name}" but it is in use by: ${list}`)
    throw createError({
      statusCode: 409,
      statusMessage: `Volume "${name}" is in use by: ${list}`,
      data: { usedBy: users }
    })
  }

  try {
    await useDocker().getVolume(name).remove({ force: getQuery(event).force === 'true' })
  } catch (err: any) {
    await logSystem('docker', 'error', 'volume.delete.failed',
      `${user.username} failed to delete volume "${name}": ${dockerErrorMessage(err)}`)
    throwDockerError(err, `Failed to delete volume "${name}"`)
  }
  await audit({ actor: user.username, action: 'volume.remove', target: name })
  await logSystem('docker', 'info', 'volume.deleted', `${user.username} deleted volume "${name}"`)
  return { ok: true }
})
