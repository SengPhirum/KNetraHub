import type { H3Event } from 'h3'
import type { Pool, PoolClient } from 'pg'
import { nanoid } from 'nanoid'
import { getWorkDb } from '~~/server/utils/moduleDb'
import { requireUser, resolveUserEntitlements, type SessionUser } from '~~/server/utils/auth'
import { audit as portalAudit } from '~~/server/utils/store'
import { recordNotification } from '~~/server/utils/notificationFeed'
import { tierGrantsPermission, type AppTier } from '~~/shared/utils/entitlements'
import type { Permission } from '~~/shared/utils/permissions'

/**
 * Central Work server helper: access gates, workspace membership
 * self-provisioning, transactions, the append-only activity trail, the portal
 * audit bridge, and small shared helpers. Every Work API route goes through
 * requireWork / requireWorkPermission — frontend visibility is never
 * sufficient. Private-space object-level authorization is layered on top in
 * workAccess.ts.
 */

export const getWork = getWorkDb
export const newId = () => nanoid()
export const nowIso = () => new Date().toISOString()

/** The organization-default workspace seeded by migration 0001_core. */
export const DEFAULT_WORKSPACE_ID = 'ws_default'

export const PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const
export type WorkPriority = typeof PRIORITIES[number]

export function clientIp(event: H3Event): string | null {
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  return (forwarded ? forwarded.split(',')[0]!.trim() : '')
    || getRequestHeader(event, 'x-real-ip')
    || event.node.req.socket?.remoteAddress
    || null
}

export function requestId(event: H3Event): string | null {
  return getRequestHeader(event, 'x-request-id') || null
}

/** Resolve the caller's Work tier (null if no access / module disabled). */
export async function workTier(user: SessionUser): Promise<AppTier | null> {
  const apps = await resolveUserEntitlements(user)
  return apps.work
}

const TIER_RANK: Record<AppTier, number> = { viewer: 1, operator: 2, manager: 3, admin: 4 }

// Membership upsert throttle: at most one write per user per interval, so the
// per-request ensureMember stays a cache hit on the hot path.
const memberSeen = new Map<string, number>()
const MEMBER_REFRESH_MS = 10 * 60 * 1000

async function ensureMember(user: SessionUser, tier: AppTier): Promise<void> {
  const key = `${DEFAULT_WORKSPACE_ID}:${user.username.toLowerCase()}`
  const last = memberSeen.get(key)
  if (last && Date.now() - last < MEMBER_REFRESH_MS) return
  memberSeen.set(key, Date.now())
  await getWork().query(
    `INSERT INTO work.workspace_members (id, workspace_id, username, display_name, tier)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (workspace_id, username)
     DO UPDATE SET display_name = EXCLUDED.display_name, tier = EXCLUDED.tier, last_seen_at = now()`,
    [newId(), DEFAULT_WORKSPACE_ID, user.username.toLowerCase(), user.displayName || user.username, tier]
  ).catch((err) => {
    memberSeen.delete(key)
    console.error('[work] ensureMember failed', err?.message)
  })
}

export interface WorkContext {
  user: SessionUser
  tier: AppTier
  workspaceId: string
}

/** Require Work access at a minimum tier. Returns the caller, tier and workspace. */
export async function requireWork(event: H3Event, min: AppTier = 'viewer'): Promise<WorkContext> {
  const user = await requireUser(event)
  const tier = await workTier(user)
  if (!tier || TIER_RANK[tier] < TIER_RANK[min]) {
    throw createError({ statusCode: 403, statusMessage: `Requires ${min} access to Work` })
  }
  await ensureMember(user, tier)
  return { user, tier, workspaceId: DEFAULT_WORKSPACE_ID }
}

/** Require a specific Work permission (resolved against the caller's Work tier). */
export async function requireWorkPermission(event: H3Event, perm: Permission): Promise<WorkContext> {
  const user = await requireUser(event)
  const tier = await workTier(user)
  if (!tier) throw createError({ statusCode: 403, statusMessage: 'No access to the Work app' })
  if (!tierGrantsPermission('work', tier, perm)) {
    throw createError({ statusCode: 403, statusMessage: `Requires permission: ${perm}` })
  }
  await ensureMember(user, tier)
  return { user, tier, workspaceId: DEFAULT_WORKSPACE_ID }
}

/** Run a function inside a BEGIN/COMMIT transaction on the Work pool. */
export async function withWorkTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getWork().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export interface ActivityInput {
  workspaceId: string
  entityType: string
  entityId: string
  taskId?: string | null
  actor: string
  action: string
  field?: string | null
  before?: unknown
  after?: unknown
  detail?: string | null
  requestId?: string | null
}

function activityValue(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value.slice(0, 2000)
  return JSON.stringify(value).slice(0, 2000)
}

/**
 * Append one activity row. Accepts a transaction client so mutations and
 * their trail commit atomically; falls back to the pool for best-effort
 * standalone records.
 */
export async function recordActivity(db: Pool | PoolClient, input: ActivityInput): Promise<void> {
  await db.query(
    `INSERT INTO work.activity
       (id, workspace_id, entity_type, entity_id, task_id, actor, action, field, before_value, after_value, detail, request_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [newId(), input.workspaceId, input.entityType, input.entityId, input.taskId ?? null,
      input.actor, input.action, input.field ?? null,
      activityValue(input.before), activityValue(input.after),
      input.detail ?? null, input.requestId ?? null]
  )
}

/**
 * Portal audit bridge for administrative / destructive Work operations
 * (delete, settings, sharing, exports). Day-to-day task edits stay in
 * work.activity; this feeds the portal-wide audit trail admins already watch.
 */
export async function workAudit(user: SessionUser, action: string, target?: string | null, detail?: string | null): Promise<void> {
  await portalAudit({ actor: user.username, action: `work.${action}`, target: target ?? null, detail: detail ?? null }).catch(() => {})
}

export type WorkNotifySeverity = 'info' | 'warning' | 'critical'

export interface WorkNotifyInput {
  severity?: WorkNotifySeverity
  event: string
  title: string
  body: string
  /** Task id (or other entity id) used by notificationLink for deep links. */
  target?: string | null
}

/** Central portal feed bridge (navbar bell). Best-effort — never throws. */
export async function workNotify(input: WorkNotifyInput): Promise<void> {
  await recordNotification({
    app: 'work',
    severity: input.severity || 'info',
    title: input.title,
    body: input.body,
    ruleType: input.event,
    target: input.target ?? null
  }).catch(() => {})
}

/** Trim + length-clamp a required text field, or throw a 400 with the label. */
export function requireText(value: unknown, label: string, max = 500): string {
  const text = String(value ?? '').trim()
  if (!text) throw createError({ statusCode: 400, statusMessage: `${label} is required` })
  if (text.length > max) throw createError({ statusCode: 400, statusMessage: `${label} must be at most ${max} characters` })
  return text
}

/** Trim + clamp an optional text field ('' → null). */
export function optionalText(value: unknown, label: string, max = 5000): string | null {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  if (!text) return null
  if (text.length > max) throw createError({ statusCode: 400, statusMessage: `${label} must be at most ${max} characters` })
  return text
}

/** Parse an optional ISO date input → ISO string or null; throws on garbage. */
export function optionalDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = Date.parse(String(value))
  if (Number.isNaN(parsed)) throw createError({ statusCode: 400, statusMessage: `${label} must be a valid date` })
  return new Date(parsed).toISOString()
}

/** Validate an optional priority value ('' / null clears it). */
export function optionalPriority(value: unknown): WorkPriority | null {
  if (value === undefined || value === null || value === '') return null
  const p = String(value)
  if (!(PRIORITIES as readonly string[]).includes(p)) {
    throw createError({ statusCode: 400, statusMessage: 'Priority must be urgent, high, normal, or low' })
  }
  return p as WorkPriority
}

/** Validate a #rrggbb color (or a small named fallback), defaulting when absent. */
export function optionalColor(value: unknown, fallback: string | null = null): string | null {
  if (value === undefined || value === null || value === '') return fallback
  const color = String(value).trim()
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw createError({ statusCode: 400, statusMessage: 'Color must be a #rrggbb hex value' })
  }
  return color.toLowerCase()
}

/** Normalize a username list: lowercase, dedupe, drop blanks, cap size. */
export function usernameList(value: unknown, label: string, max = 50): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw createError({ statusCode: 400, statusMessage: `${label} must be an array of usernames` })
  const out = [...new Set(value.map((v) => String(v).trim().toLowerCase()).filter(Boolean))]
  if (out.length > max) throw createError({ statusCode: 400, statusMessage: `${label} allows at most ${max} entries` })
  return out
}
