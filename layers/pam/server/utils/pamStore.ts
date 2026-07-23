import type { H3Event } from 'h3'
import type { Pool, PoolClient } from 'pg'
import { nanoid } from 'nanoid'
import { getPamDb } from '~~/server/utils/moduleDb'
import { requireUser, resolveUserEntitlements, type SessionUser } from '~~/server/utils/auth'
import { audit as portalAudit } from '~~/server/utils/store'
import { tierGrantsPermission, type AppTier } from '~~/shared/utils/entitlements'
import type { Permission } from '~~/shared/utils/permissions'
import { appendAudit, type AuditInput, type AuditSeverity } from './pamAudit'
import { SAFE_PERMISSIONS, type SafePermission } from './pamPolicy'

/**
 * Central PAM server helper: access gates, request-context capture, the
 * safe-membership authorization layer, the audit bridge (portal + PAM chain),
 * settings, and small DB helpers. Every PAM API route goes through requirePam /
 * requirePamPermission AND, for safe-scoped actions, assertSafePermission —
 * frontend visibility is never sufficient.
 */

export const getPam = getPamDb
export const newId = () => nanoid()
export const nowIso = () => new Date().toISOString()

export function clientIp(event: H3Event): string | null {
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  return (forwarded ? forwarded.split(',')[0]!.trim() : '')
    || getRequestHeader(event, 'x-real-ip')
    || event.node.req.socket?.remoteAddress
    || null
}

export function userAgent(event: H3Event): string | null {
  return getRequestHeader(event, 'user-agent') ?? null
}

/** Resolve the caller's PAM tier (null if no access / module disabled). */
export async function pamTier(user: SessionUser): Promise<AppTier | null> {
  const apps = await resolveUserEntitlements(user)
  return apps.pam
}

/** Require PAM access at a minimum tier. Returns the caller and their tier. */
export async function requirePam(event: H3Event, min: AppTier = 'viewer'): Promise<{ user: SessionUser; tier: AppTier }> {
  const user = await requireUser(event)
  const tier = await pamTier(user)
  const rank: Record<AppTier, number> = { viewer: 1, operator: 2, manager: 3, admin: 4 }
  if (!tier || rank[tier] < rank[min]) {
    throw createError({ statusCode: 403, statusMessage: `Requires ${min} access to Privileged Access` })
  }
  return { user, tier }
}

/** Require a specific PAM permission (resolved against the caller's PAM tier). */
export async function requirePamPermission(event: H3Event, perm: Permission): Promise<{ user: SessionUser; tier: AppTier }> {
  const user = await requireUser(event)
  const tier = await pamTier(user)
  if (!tier) throw createError({ statusCode: 403, statusMessage: 'No access to the Privileged Access app' })
  if (!tierGrantsPermission('pam', tier, perm)) {
    throw createError({ statusCode: 403, statusMessage: `Requires permission: ${perm}` })
  }
  return { user, tier }
}

// ── Safe-membership authorization layer ───────────────────────────────────────

/** Group/role identifiers to match against safe group members. */
function principalGroups(user: SessionUser): string[] {
  const groups = new Set<string>((user.realmRoles || []).map((r) => String(r).toLowerCase().replace(/^\//, '')))
  return [...groups]
}

/**
 * The granular safe permissions the caller holds on a safe. PAM admin tier
 * holds all of them (safe administration); otherwise they are the union of the
 * permissions on every safe_members row (user or matching group) for the caller.
 */
export async function resolveSafePermissions(
  user: SessionUser,
  tier: AppTier,
  safeId: string,
  db: Pool = getPam()
): Promise<Set<SafePermission>> {
  if (tier === 'admin') return new Set(SAFE_PERMISSIONS)
  const groups = principalGroups(user)
  const { rows } = await db.query(
    `SELECT smp.permission
       FROM pam.safe_members sm
       JOIN pam.safe_member_permissions smp ON smp.member_id = sm.id
      WHERE sm.safe_id = $1
        AND (
          (sm.principal_type = 'user'  AND lower(sm.principal_id) = lower($2)) OR
          (sm.principal_type = 'user'  AND lower(sm.principal_id) = lower($3)) OR
          (sm.principal_type = 'group' AND lower(sm.principal_id) = ANY($4::text[]))
        )`,
    [safeId, user.username, user.id, groups]
  )
  return new Set(rows.map((r) => r.permission as SafePermission))
}

/** Is the caller a member of the safe at all (any permission)? */
export async function isSafeMember(user: SessionUser, tier: AppTier, safeId: string, db: Pool = getPam()): Promise<boolean> {
  if (tier === 'admin') return true
  const perms = await resolveSafePermissions(user, tier, safeId, db)
  return perms.size > 0
}

/** Throw 403 unless the caller holds `perm` on the safe. */
export async function assertSafePermission(
  user: SessionUser,
  tier: AppTier,
  safeId: string,
  perm: SafePermission,
  db: Pool = getPam()
): Promise<void> {
  const perms = await resolveSafePermissions(user, tier, safeId, db)
  if (!perms.has(perm)) {
    throw createError({ statusCode: 403, statusMessage: `Safe permission required: ${perm}` })
  }
}

/** Safe ids the caller may at least list (for scoping list queries). null = all (admin). */
export async function accessibleSafeIds(user: SessionUser, tier: AppTier, db: Pool = getPam()): Promise<string[] | null> {
  if (tier === 'admin') return null
  const groups = principalGroups(user)
  const { rows } = await db.query(
    `SELECT DISTINCT sm.safe_id
       FROM pam.safe_members sm
      WHERE (sm.principal_type = 'user'  AND lower(sm.principal_id) = lower($1))
         OR (sm.principal_type = 'user'  AND lower(sm.principal_id) = lower($2))
         OR (sm.principal_type = 'group' AND lower(sm.principal_id) = ANY($3::text[]))`,
    [user.username, user.id, groups]
  )
  return rows.map((r) => r.safe_id as string)
}

// ── Audit bridge ──────────────────────────────────────────────────────────────

/**
 * Record a PAM action to BOTH the tamper-evident PAM chain and the curated
 * portal audit trail. Request context (actor source, IP, UA, effective perms)
 * is captured from the event. Never pass secret values in `details`.
 */
export async function pamAudit(
  event: H3Event,
  user: SessionUser,
  input: Omit<AuditInput, 'actor' | 'sourceIp' | 'userAgent' | 'actorSource'> & { severity?: AuditSeverity }
): Promise<void> {
  await appendAudit({
    ...input,
    actor: user.username,
    actorSource: user.source,
    sourceIp: clientIp(event),
    userAgent: userAgent(event)
  })
  // Portal audit is a curated long-retention trail; keep it high-signal.
  if ((input.severity ?? 'info') !== 'info' || input.result === 'denied' || input.result === 'failure') {
    await portalAudit({
      actor: user.username,
      action: `pam.${input.action}`,
      target: input.objectId ?? undefined,
      detail: input.reason ?? undefined
    }).catch(() => {})
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function getPamSetting<T = unknown>(key: string, fallback: T, db: Pool = getPam()): Promise<T> {
  const { rows } = await db.query('SELECT value FROM pam.settings WHERE key = $1', [key])
  if (!rows.length) return fallback
  try { return JSON.parse(rows[0].value) as T } catch { return fallback }
}

export async function setPamSetting(key: string, value: unknown, actor: string, db: Pool = getPam()): Promise<void> {
  await db.query(
    `INSERT INTO pam.settings (key, value, updated_at, updated_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value), nowIso(), actor]
  )
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function withPamTx<T>(fn: (client: PoolClient) => Promise<T>, db: Pool = getPam()): Promise<T> {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Load a row by id from a pam table or throw 404. Table name is a fixed literal. */
export async function loadOr404<T = any>(table: string, id: string, notFound = 'Not found', db: Pool = getPam()): Promise<T> {
  const { rows } = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id])
  if (!rows.length) throw createError({ statusCode: 404, statusMessage: notFound })
  return rows[0] as T
}
