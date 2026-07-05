import { requireRole } from '~~/server/utils/auth'
import { saveGitlabSettings } from '~~/layers/docker/server/utils/gitlabSettings'
import type { GitlabSettings } from '~~/layers/docker/server/utils/gitlabSettings'
import { audit } from '~~/server/utils/store'

const FIELDS: (keyof GitlabSettings)[] = ['enabled', 'url', 'token', 'projectId', 'branch', 'stacksPath']

function pick(input: Record<string, unknown>): Partial<GitlabSettings> {
  const out: Record<string, unknown> = {}
  for (const f of FIELDS) {
    const v = input[f]
    if (v === undefined) continue
    out[f] = typeof v === 'boolean' ? v : String(v).trim()
  }
  return out as Partial<GitlabSettings>
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const body = await readBody<Record<string, unknown>>(event)
  const patch = pick(body || {})

  if (typeof patch.enabled !== 'undefined' && typeof patch.enabled !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: '"enabled" must be a boolean' })
  }

  await saveGitlabSettings(patch, user.username)
  await audit({ actor: user.username, action: 'settings.gitlab.update' })
  return { ok: true }
})
