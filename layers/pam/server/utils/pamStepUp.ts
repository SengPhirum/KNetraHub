import type { H3Event } from 'h3'
import { requireUser, type SessionUser } from '~~/server/utils/auth'
import { verifySecurityPassword, hasSecurityPassword } from '~~/server/utils/store'
import { getPamDb } from '~~/server/utils/moduleDb'
import { stepUpVerdict } from './pamStepUpCore'
import { appendAudit } from './pamAudit'
import { newId, nowIso } from './pamStore'

/**
 * PAM step-up for high-risk actions (critical/high reveal, break-glass, critical
 * deletes, recording export, key/recovery ops). Unlike the portal-wide
 * confirmAction, this does NOT exempt bearer tokens: a machine caller must
 * either carry an explicit service scope (interactive_bypass) or present a valid
 * step-up proof. Every attempt is audited; a success records a short-lived,
 * consumed step-up challenge for freshness/traceability.
 */
export async function requirePamStepUp(event: H3Event, purpose = 'high-risk PAM action'): Promise<SessionUser> {
  const user = await requireUser(event)
  const authHeader = getRequestHeader(event, 'authorization') || ''
  const authType = authHeader.startsWith('Bearer ') ? 'bearer' : 'session'

  const configured = await hasSecurityPassword(user.id).catch(() => false)
  const proof = getRequestHeader(event, 'x-confirm-password') || ''
  const proofValid = proof ? await verifySecurityPassword(user.id, proof).catch(() => false) : false

  const verdict = stepUpVerdict({ authType, securityPasswordConfigured: configured, providedProof: !!proof, proofValid })
  if (!verdict.ok) {
    if (verdict.code === 'stepup_failed') {
      await appendAudit({ actor: user.username, action: 'pam.stepup.failed', objectType: 'stepup', objectId: purpose, result: 'denied', severity: 'high', reason: purpose }).catch(() => {})
    }
    throw createError({
      statusCode: verdict.statusCode!,
      statusMessage: verdict.message,
      data: verdict.code === 'setup_required' ? { securityPasswordRequired: true } : { stepUpRequired: true, code: verdict.code }
    })
  }

  await getPamDb().query(
    'INSERT INTO pam.stepup_challenges (id, user_id, username, method, purpose, created_at, expires_at, consumed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$6)',
    [newId(), user.id, user.username, 'security_password', purpose, nowIso(), new Date(Date.now() + 300_000).toISOString()]
  ).catch(() => {})
  await appendAudit({ actor: user.username, action: 'pam.stepup.ok', objectType: 'stepup', objectId: purpose, result: 'success', severity: 'notice', reason: purpose }).catch(() => {})
  return user
}
