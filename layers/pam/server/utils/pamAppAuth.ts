import { createHash, randomBytes } from 'node:crypto'
import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { nowIso } from './pamStore'

/**
 * Application/workload identity authentication for the secrets API. For the
 * api_token method we generate a high-entropy token, store ONLY its SHA-256
 * hash + a short prefix, and return the raw token to the caller exactly once.
 * Other methods (OIDC workload, k8s SA JWT, mTLS, signed JWT, cloud workload)
 * validate a presented assertion against the identity's matcher — those
 * verifiers plug in here; api_token is the always-available baseline.
 */

export function generateAppToken(): { token: string; hash: string; prefix: string } {
  const raw = `pam_${randomBytes(30).toString('base64url')}`
  const hash = createHash('sha256').update(raw).digest('hex')
  return { token: raw, hash, prefix: raw.slice(0, 12) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface AuthedApplication {
  applicationId: string
  identityId: string
  applicationName: string
}

/** Resolve an application identity from a presented api_token. */
export async function authenticateAppToken(token: string, db: Pool = getPamDb()): Promise<AuthedApplication | null> {
  if (!token) return null
  const hash = hashToken(token)
  const { rows } = await db.query(
    `SELECT i.id AS identity_id, i.application_id, i.enabled, i.expires_at, a.name, a.enabled AS app_enabled
       FROM pam.application_identities i JOIN pam.applications a ON a.id = i.application_id
      WHERE i.method='api_token' AND i.token_hash=$1 LIMIT 1`,
    [hash]
  )
  if (!rows.length) return null
  const row = rows[0]
  if (!row.enabled || !row.app_enabled) return null
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return null
  await db.query('UPDATE pam.application_identities SET last_used=$2 WHERE id=$1', [row.identity_id, nowIso()]).catch(() => {})
  return { applicationId: row.application_id, identityId: row.identity_id, applicationName: row.name }
}

/** Is an application authorized to read a secret (by explicit policy or path pattern)? */
export async function appMaySeeSecret(applicationId: string, secret: { id: string; path: string }, db: Pool = getPamDb()): Promise<{ allowed: boolean; leaseTtl: number; oneTime: boolean }> {
  const { rows } = await db.query(
    'SELECT * FROM pam.secret_policies WHERE application_id=$1 AND enabled=true AND (secret_id=$2 OR path_pattern IS NOT NULL)',
    [applicationId, secret.id]
  )
  for (const p of rows) {
    if (p.secret_id === secret.id || (p.path_pattern && pathMatch(String(p.path_pattern), secret.path))) {
      if (!String(p.capabilities || 'read').includes('read')) continue
      return { allowed: true, leaseTtl: Number(p.lease_ttl_seconds) || 300, oneTime: p.one_time === true }
    }
  }
  return { allowed: false, leaseTtl: 0, oneTime: false }
}

/** Simple glob path match supporting a trailing/embedded "*". */
function pathMatch(pattern: string, path: string): boolean {
  const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i')
  return re.test(path)
}
