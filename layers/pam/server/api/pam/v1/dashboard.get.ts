import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, accessibleSafeIds } from '~~/layers/pam/server/utils/pamStore'

/**
 * Executive PAM dashboard aggregation. Counts are scoped to the safes the
 * caller can see (admins see everything); "pending approvals" is scoped to the
 * caller's approver queue. Every figure links to a filtered detail page.
 */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const db = getPamDb()
  const safeIds = await accessibleSafeIds(user, tier)
  const scoped = safeIds !== null
  // account filter fragment scoped to accessible safes
  const acctWhere = scoped ? 'a.safe_id = ANY($1::text[])' : 'true'
  const params = scoped ? [safeIds] : []

  const q = (sql: string) => db.query(sql, params)
  const one = async (sql: string) => Number((await q(sql)).rows[0]?.c ?? 0)

  const nowIso = new Date().toISOString()
  const soonIso = new Date(Date.now() + 7 * 86_400_000).toISOString()

  const [
    managedAccounts, unmanagedAccounts, pendingOnboard, dueRotation, rotationFailures,
    verifyFailures, reconcileFailures, activeSessions, staleAccounts, orphaned,
    deadJobs, byPlatform, bySafe, sessionsByProtocol, recentEvents, riskOpen, breakGlass
  ] = await Promise.all([
    one(`SELECT count(*)::int c FROM pam.accounts a WHERE a.deleted_at IS NULL AND a.rotation_status='managed' AND ${acctWhere}`),
    one(`SELECT count(*)::int c FROM pam.accounts a WHERE a.deleted_at IS NULL AND a.rotation_status='unmanaged' AND ${acctWhere}`),
    db.query('SELECT count(*)::int c FROM pam.discovered_accounts WHERE status=\'pending\'').then((r) => Number(r.rows[0].c)),
    one(`SELECT count(*)::int c FROM pam.accounts a WHERE a.deleted_at IS NULL AND a.auto_managed AND a.next_rotation_at IS NOT NULL AND a.next_rotation_at <= '${soonIso}' AND ${acctWhere}`),
    one(`SELECT count(*)::int c FROM pam.accounts a WHERE a.deleted_at IS NULL AND a.rotation_status='failed' AND ${acctWhere}`),
    db.query("SELECT count(*)::int c FROM pam.credential_versions cv JOIN pam.accounts a ON a.id=cv.account_id WHERE cv.active AND cv.verify_result='failed'").then((r) => Number(r.rows[0].c)),
    db.query("SELECT count(*)::int c FROM pam.risk_events WHERE rule_key='reconcile_failure' AND status='open'").then((r) => Number(r.rows[0].c)),
    db.query("SELECT count(*)::int c FROM pam.sessions WHERE state IN ('starting','active','idle')").then((r) => Number(r.rows[0].c)),
    one(`SELECT count(*)::int c FROM pam.accounts a WHERE a.deleted_at IS NULL AND (a.last_used IS NULL OR a.last_used < '${new Date(Date.now() - 90 * 86_400_000).toISOString()}') AND ${acctWhere}`),
    one(`SELECT count(*)::int c FROM pam.accounts a WHERE a.deleted_at IS NULL AND (a.owner IS NULL OR a.owner='') AND ${acctWhere}`),
    db.query("SELECT count(*)::int c FROM pam.credential_jobs WHERE status='dead'").then((r) => Number(r.rows[0].c)),
    q(`SELECT COALESCE(p.name,'(none)') AS name, count(*)::int c FROM pam.accounts a LEFT JOIN pam.platforms p ON p.id=a.platform_id WHERE a.deleted_at IS NULL AND ${acctWhere} GROUP BY p.name ORDER BY c DESC LIMIT 8`).then((r) => r.rows),
    q(`SELECT s.name, count(a.id)::int c FROM pam.safes s LEFT JOIN pam.accounts a ON a.safe_id=s.id AND a.deleted_at IS NULL WHERE s.deleted_at IS NULL AND ${scoped ? 's.id = ANY($1::text[])' : 'true'} GROUP BY s.name ORDER BY c DESC LIMIT 8`).then((r) => r.rows),
    db.query('SELECT protocol, count(*)::int c FROM pam.sessions GROUP BY protocol ORDER BY c DESC').then((r) => r.rows),
    db.query("SELECT id, ts, actor, action, object_type, result, severity FROM pam.audit_events WHERE severity IN ('high','critical') ORDER BY seq DESC LIMIT 10").then((r) => r.rows),
    db.query("SELECT count(*)::int c FROM pam.risk_events WHERE status='open'").then((r) => Number(r.rows[0].c)),
    db.query("SELECT count(*)::int c FROM pam.access_grants WHERE emergency=true AND created_at > '" + new Date(Date.now() - 30 * 86_400_000).toISOString() + "'").then((r) => Number(r.rows[0].c))
  ])

  // Pending approvals scoped to the caller (as an approver) — admins see all.
  const pendingApprovals = tier === 'admin'
    ? Number((await db.query("SELECT count(*)::int c FROM pam.request_approvals WHERE decision='pending'")).rows[0].c)
    : Number((await db.query(
        "SELECT count(*)::int c FROM pam.request_approvals WHERE decision='pending' AND (lower(approver)=lower($1))",
        [user.username]
      )).rows[0].c)

  const expiringGrants = Number((await db.query(
    "SELECT count(*)::int c FROM pam.access_grants WHERE status='active' AND expires_at <= $1 AND expires_at > $2",
    [soonIso, nowIso]
  )).rows[0].c)

  return {
    counts: {
      managedAccounts, unmanagedAccounts, pendingOnboard, dueRotation, rotationFailures,
      verifyFailures, reconcileFailures, activeSessions, pendingApprovals, expiringGrants,
      staleAccounts, orphaned, riskOpen, breakGlass, deadJobs
    },
    byPlatform, bySafe, sessionsByProtocol, recentEvents
  }
})
