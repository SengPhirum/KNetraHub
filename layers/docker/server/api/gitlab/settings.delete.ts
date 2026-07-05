import { requireRole } from '~~/server/utils/auth'
import { resetGitlabSettings } from '~~/layers/docker/server/utils/gitlabSettings'
import { audit } from '~~/server/utils/store'

/** Remove the DB override; GitLab settings follow environment defaults again. */
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  await resetGitlabSettings()
  await audit({ actor: user.username, action: 'settings.gitlab.reset', detail: 'reverted to environment defaults' })
  return { ok: true }
})
