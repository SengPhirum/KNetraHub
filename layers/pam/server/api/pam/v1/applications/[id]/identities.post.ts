import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, pamAudit, loadOr404, newId, nowIso } from '~~/layers/pam/server/utils/pamStore'
import { generateAppToken } from '~~/layers/pam/server/utils/pamAppAuth'

const METHODS = ['oidc_workload', 'k8s_sa', 'mtls', 'signed_jwt', 'swarm_service', 'api_token', 'cloud_workload', 'host']

/**
 * Add an authentication identity to an application (pam.secret.manage). For the
 * api_token method the raw token is returned exactly once and only its hash is
 * stored; other methods store a matcher (issuer/subject/SPIFFE ID/cert CN).
 */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.secret.manage')
  const appId = getRouterParam(event, 'id')!
  await loadOr404('pam.applications', appId, 'Application not found')
  const body = await readBody(event)
  const method = METHODS.includes(body?.method) ? body.method : 'api_token'
  const name = String(body?.name || method).trim()

  const db = getPamDb()
  const id = newId()
  let token: string | null = null
  let tokenHash: string | null = null
  let tokenPrefix: string | null = null
  if (method === 'api_token') {
    const gen = generateAppToken()
    token = gen.token; tokenHash = gen.hash; tokenPrefix = gen.prefix
  }
  await db.query(
    `INSERT INTO pam.application_identities
      (id, application_id, method, name, matcher, token_hash, token_prefix, allowed_source_networks, expires_at, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, appId, method, name, body.matcher ? JSON.stringify(body.matcher) : null, tokenHash, tokenPrefix,
      body.allowed_source_networks ? JSON.stringify(body.allowed_source_networks) : null, body.expires_at || null, nowIso(), user.username]
  )
  await pamAudit(event, user, { action: 'application.identity.create', objectType: 'application', objectId: appId, details: { method, name } })
  // The raw token is returned ONCE and never stored or logged.
  return { id, method, ...(token ? { token, tokenPrefix, note: 'Store this token now — it will not be shown again.' } : {}) }
})
