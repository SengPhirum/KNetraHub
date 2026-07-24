import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { createRunner } from '~~/layers/pam/server/utils/pamRunner'
import { getConnector } from '~~/layers/pam/server/connectors/registry'

/** Provision a runner identity. The clear token is returned ONCE here and never
 * again (only its SHA-256 is stored) — the caller must surface it in a one-time
 * dialog and never persist it in a banner or the DB. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.connector.manage')
  const body = await readBody(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Runner name is required' })

  const allowlist = Array.isArray(body?.connectorAllowlist)
    ? [...new Set(body.connectorAllowlist.map((k: unknown) => String(k)))]
    : []
  for (const key of allowlist) {
    if (!getConnector(key)) throw createError({ statusCode: 400, statusMessage: `Unknown connector: ${key}` })
  }

  const expiresAt = body?.expiresAt ? new Date(String(body.expiresAt)).toISOString() : null
  const created = await createRunner({
    name,
    description: body?.description ? String(body.description) : null,
    connectorAllowlist: allowlist,
    maxConcurrentJobs: Number.isFinite(body?.maxConcurrentJobs) ? Number(body.maxConcurrentJobs) : 4,
    expiresAt,
    createdBy: user.username
  })
  await pamAudit(event, user, { action: 'runner.create', objectType: 'runner', objectId: created.id, severity: 'notice', details: { name, allowlist } })

  // token returned once; caller shows it in a one-time credential dialog.
  return { id: created.id, name, tokenPrefix: created.tokenPrefix, token: created.token }
})
