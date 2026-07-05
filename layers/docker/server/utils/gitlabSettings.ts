import { getAppSetting, setAppSetting, deleteAppSetting } from '~~/server/utils/store'
import { encryptSecret, decryptSecret } from '~~/server/utils/secretCrypto'

/**
 * GitLab integration settings - same env-defaults + DB-override pattern as
 * authSettings.ts. The token is encrypted at rest; a blank token in a patch
 * keeps the current value (same convention as LDAP bindCredentials / OIDC
 * clientSecret).
 */

export interface GitlabSettings {
  enabled: boolean
  url: string
  token: string
  projectId: string
  branch: string
  stacksPath: string
}

const KEY = 'integrations.gitlab'

function envGitlab(): GitlabSettings {
  const c = useRuntimeConfig().gitlab
  return {
    enabled: !!(c.token && c.projectId), // env-only install: enabled is implicit
    url: c.url,
    token: c.token,
    projectId: c.projectId,
    branch: c.branch,
    stacksPath: c.stacksPath
  }
}

async function readOverride(): Promise<Partial<GitlabSettings> | null> {
  const raw = await getAppSetting(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<GitlabSettings>
    // Decrypt only the override's own token - env defaults are already
    // plaintext from process.env and must never pass through decryptSecret.
    if (parsed.token) parsed.token = decryptSecret(parsed.token)
    return parsed
  } catch {
    return null
  }
}

export async function getGitlabSettings(): Promise<GitlabSettings> {
  return { ...envGitlab(), ...(await readOverride()) }
}

export async function hasGitlabOverride(): Promise<boolean> {
  return (await getAppSetting(KEY)) !== null
}

/** Persist a partial update; a blank token in the patch keeps the current value. */
export async function saveGitlabSettings(patch: Partial<GitlabSettings>, actor: string): Promise<GitlabSettings> {
  const current = await getGitlabSettings()
  const next = { ...current, ...patch }
  if (!patch.token) next.token = current.token
  const stored = { ...next, token: next.token ? encryptSecret(next.token) : '' }
  await setAppSetting(KEY, JSON.stringify(stored), actor)
  return next
}

export async function resetGitlabSettings(): Promise<void> {
  await deleteAppSetting(KEY)
}
