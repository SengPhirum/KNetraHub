import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission, resolveSafePermissions, pamAudit, loadOr404, clientIp, getPamSetting } from '~~/layers/pam/server/utils/pamStore'
import { openActiveCredential, createLease } from '~~/layers/pam/server/utils/pamVault'
import { enqueueJob } from '~~/layers/pam/server/utils/pamJobs'
import { recordRisk } from '~~/layers/pam/server/utils/pamRisk'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'

/**
 * Reveal a credential — the ONLY metadata endpoint that returns plaintext, and
 * the most heavily gated one:
 *   - pam.account.reveal permission (manager tier) AND reveal_credential on the safe
 *   - a mandatory reason
 *   - a valid, approved+active grant when the account/policy requires one
 *   - step-up security-password confirmation for critical accounts
 *   - a short display TTL + no-store cache headers returned to the client
 *   - a HIGH-severity audit event and a recorded lease
 *   - optional immediate post-view rotation (per setting / account flag)
 * Connect + credential injection is always preferred over reveal.
 */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePamPermission(event, 'pam.account.reveal')
  const id = getRouterParam(event, 'id')!
  const account = await loadOr404<any>('pam.accounts', id, 'Account not found')
  if (account.deleted_at) throw createError({ statusCode: 404, statusMessage: 'Account not found' })

  const perms = await resolveSafePermissions(user, tier, account.safe_id)
  if (!perms.has('reveal_credential')) throw createError({ statusCode: 403, statusMessage: 'You cannot reveal credentials in this safe' })

  const body = await readBody(event).catch(() => ({}))
  const reason = String(body?.reason || '').trim()
  if (!reason) throw createError({ statusCode: 400, statusMessage: 'A reason is required to reveal a credential' })

  // Critical accounts require a fresh step-up (security password) confirmation.
  if (account.criticality === 'critical' || account.criticality === 'high') {
    await requirePasswordConfirm(event)
  }

  const db = getPamDb()
  // If the account is not admin-tier free-access, require an active approved grant.
  if (tier !== 'admin') {
    const grant = await db.query(
      "SELECT id FROM pam.access_grants WHERE account_id=$1 AND lower(grantee)=lower($2) AND status='active' AND action IN ('reveal','use','administer') AND starts_at <= $3 AND expires_at > $3 LIMIT 1",
      [id, user.username, new Date().toISOString()]
    )
    if (!grant.rows.length) {
      await pamAudit(event, user, { action: 'account.reveal.denied', objectType: 'account', objectId: id, safeId: account.safe_id, severity: 'high', result: 'denied', reason })
      throw createError({ statusCode: 403, statusMessage: 'An approved, active access grant is required to reveal this credential. Submit an access request.' })
    }
  }

  const cred = await openActiveCredential(id, db)
  if (!cred) throw createError({ statusCode: 409, statusMessage: 'This account has no stored credential' })

  const seconds = await getPamSetting<number>('reveal.default_seconds', 45, db)
  const disableCopy = await getPamSetting<boolean>('reveal.disable_copy', false, db)
  const watermark = await getPamSetting<boolean>('reveal.watermark', true, db)
  const rotateAfter = account.rotate_after_reveal === true || await getPamSetting<boolean>('reveal.rotate_after', false, db)

  await createLease({ accountId: id, credentialVersion: cred.version, lessee: user.username, leaseType: 'reveal', ttlSeconds: seconds, sourceIp: clientIp(event), oneTime: true }, db)
  await db.query('UPDATE pam.accounts SET last_used=$2 WHERE id=$1', [id, new Date().toISOString()])
  await pamAudit(event, user, { action: 'account.reveal', objectType: 'account', objectId: id, safeId: account.safe_id, severity: 'high', reason, details: { version: cred.version } })

  // Excessive-reveal heuristic: > 5 reveals by this user in 10 minutes.
  const recent = await db.query(
    "SELECT count(*)::int c FROM pam.audit_events WHERE actor=$1 AND action='account.reveal' AND ts > $2",
    [user.username, new Date(Date.now() - 10 * 60_000).toISOString()]
  )
  if (Number(recent.rows[0].c) > 5) {
    await recordRisk({ ruleKey: 'excessive_reveals', actor: user.username, accountId: id, severity: 'high', explanation: `${recent.rows[0].c} credential reveals in the last 10 minutes.` }, db)
  }

  if (rotateAfter) {
    await enqueueJob({ jobType: 'rotate', accountId: id, safeId: account.safe_id, platformId: account.platform_id, trigger: 'after-reveal', createdBy: user.username }, db)
  }

  // Prevent any caching of the plaintext response.
  setResponseHeaders(event, {
    'cache-control': 'no-store, no-cache, must-revalidate, private',
    pragma: 'no-cache',
    expires: '0'
  })
  return {
    username: account.username,
    value: cred.value,
    valueType: cred.valueType,
    version: cred.version,
    displaySeconds: seconds,
    disableCopy,
    watermark: watermark ? `${user.username} · ${new Date().toISOString()}` : null,
    rotatingAfter: rotateAfter
  }
})
