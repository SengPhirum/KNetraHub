import { requireUser } from '~~/server/utils/auth'
import { getGitlabSettings, hasGitlabOverride } from '~~/layers/docker/server/utils/gitlabSettings'
import { checkGitlabConnection } from '~~/layers/docker/server/utils/gitlab'

/**
 * Doubles as both the read-only status indicator's data source AND the
 * settings-fetch for the admin edit form - the live connectivity check only
 * runs here (never on hot paths like stack list/deploy), since this is only
 * hit when an admin views Settings.
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const [settings, overridden] = await Promise.all([getGitlabSettings(), hasGitlabOverride()])

  const base = {
    url: settings.url,
    projectId: settings.projectId,
    branch: settings.branch,
    stacksPath: settings.stacksPath,
    enabled: settings.enabled,
    hasToken: !!settings.token,
    overridden
  }

  if (!settings.enabled || !settings.token || !settings.projectId) {
    return { configured: false, connected: false, ...base }
  }

  const result = await checkGitlabConnection()
  return { configured: true, connected: result.ok, error: result.error, ...base }
})
