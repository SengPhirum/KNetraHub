import { getPamDb } from '~~/server/utils/moduleDb'
import { authenticateAppToken, appMaySeeSecret } from '~~/layers/pam/server/utils/pamAppAuth'
import { openSecretValue, createLease } from '~~/layers/pam/server/utils/pamVault'
import { appendAudit } from '~~/layers/pam/server/utils/pamAudit'
import { recordRisk } from '~~/layers/pam/server/utils/pamRisk'
import { clientIp } from '~~/layers/pam/server/utils/pamStore'

/**
 * Secrets API for applications/workloads. Authenticated by an application
 * identity token (Bearer), NOT a portal session. Returns a secret value ONLY
 * after policy evaluation, records a lease, audits every access, and never logs
 * the value. Response is marked no-store. An application can retrieve ONLY the
 * secrets its secret_policies authorize.
 */
export default defineEventHandler(async (event) => {
  const auth = getRequestHeader(event, 'authorization') || ''
  const body = await readBody(event).catch(() => ({}))
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : String(body?.token || '')
  const db = getPamDb()
  const app = await authenticateAppToken(token, db)
  if (!app) throw createError({ statusCode: 401, statusMessage: 'Invalid application credential' })

  const path = String(body?.path || '').trim()
  const secretId = String(body?.secret_id || '').trim()
  if (!path && !secretId) throw createError({ statusCode: 400, statusMessage: 'path or secret_id is required' })

  const sec = await db.query(
    secretId ? 'SELECT id, path, revoked, deleted_at FROM pam.secrets WHERE id=$1' : 'SELECT id, path, revoked, deleted_at FROM pam.secrets WHERE lower(path)=lower($1)',
    [secretId || path]
  )
  if (!sec.rows.length || sec.rows[0].deleted_at) throw createError({ statusCode: 404, statusMessage: 'Secret not found' })
  const secret = sec.rows[0]
  if (secret.revoked) throw createError({ statusCode: 409, statusMessage: 'Secret is revoked' })

  const decision = await appMaySeeSecret(app.applicationId, { id: secret.id, path: secret.path }, db)
  if (!decision.allowed) {
    await appendAudit({ actor: `app:${app.applicationName}`, action: 'secret.retrieve.denied', objectType: 'secret', objectId: secret.id, result: 'denied', severity: 'high', sourceIp: clientIp(event) }, db).catch(() => {})
    throw createError({ statusCode: 403, statusMessage: 'This application is not authorized for that secret' })
  }

  const opened = await openSecretValue(secret.id, body?.version ? Number(body.version) : undefined, db)
  if (!opened) throw createError({ statusCode: 409, statusMessage: 'Secret has no value version' })

  await createLease({ accountId: secret.id, credentialVersion: opened.version, lessee: `app:${app.applicationName}`, leaseType: 'application', ttlSeconds: decision.leaseTtl, sourceIp: clientIp(event), oneTime: decision.oneTime }, db).catch(() => {})
  await appendAudit({ actor: `app:${app.applicationName}`, action: 'secret.retrieve', objectType: 'secret', objectId: secret.id, result: 'success', sourceIp: clientIp(event), details: { path: secret.path, version: opened.version, leaseTtl: decision.leaseTtl } }, db)

  // Excessive-retrieval heuristic.
  const recent = await db.query(
    "SELECT count(*)::int c FROM pam.audit_events WHERE actor=$1 AND action='secret.retrieve' AND ts > $2",
    [`app:${app.applicationName}`, new Date(Date.now() - 60_000).toISOString()]
  )
  if (Number(recent.rows[0].c) > 60) {
    await recordRisk({ ruleKey: 'excessive_secret_retrieval', actor: `app:${app.applicationName}`, target: secret.path, explanation: `${recent.rows[0].c} secret retrievals in the last minute.` }, db)
  }

  setResponseHeaders(event, { 'cache-control': 'no-store, private', pragma: 'no-cache' })
  return { path: secret.path, version: opened.version, value: opened.value, leaseTtlSeconds: decision.leaseTtl, oneTime: decision.oneTime }
})
