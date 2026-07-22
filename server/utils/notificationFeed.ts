import { nanoid } from 'nanoid'
import { getDb } from './db'
import { resolveUserEntitlements, type SessionUser } from './auth'
import { APP_KEYS } from '../../shared/utils/entitlements'

/**
 * The centralized in-portal notification feed behind the navbar bell.
 *
 * Every alert engine (portal, docker, monitoring, ipmgt) records one row here
 * in addition to delivering to its external channels, so there is one in-app
 * history regardless of which module raised the alert. Rows are broadcast and
 * read state is per user (notification_reads).
 *
 * Visibility: a row tagged with an app key is only shown to users entitled to
 * that app; 'portal' rows are admin-only. That filter is applied server-side in
 * every read here - never trust the client to scope its own feed.
 */

/** Owning module of a notification: a sub-app key, or the portal itself. */
export type NotificationApp = 'portal' | (typeof APP_KEYS)[number]
export type NotificationSeverity = 'critical' | 'warning' | 'info'

export interface FeedNotification {
  id: string
  app: string
  severity: string
  title: string
  body: string
  ruleType?: string
  target?: string
  createdAt: string
  read: boolean
}

/** How long feed rows are kept. Pruned opportunistically on write. */
const RETENTION_DAYS = 30

/**
 * Record one notification. Never throws — callers are alert paths that must not
 * break because the feed insert failed (they still deliver to their channels).
 */
export async function recordNotification(input: {
  app: NotificationApp
  severity: NotificationSeverity
  title: string
  body: string
  ruleType?: string
  target?: string | null
}): Promise<void> {
  try {
    const id = nanoid()
    await getDb().query(
      `INSERT INTO notifications (id, app, severity, title, body, rule_type, target, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, input.app, input.severity, input.title, input.body, input.ruleType ?? null, input.target ?? null, new Date().toISOString()]
    )
    // Opportunistic retention sweep: cheap enough at ~2% of writes to keep the
    // table bounded without a scheduled job or a delete on every insert.
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString()
      await getDb().query('DELETE FROM notifications WHERE created_at < $1', [cutoff]).catch(() => null)
    }
  } catch {
    /* the alert itself already delivered; a feed write must never surface */
  }
}

/** App keys this user may see notifications for, plus 'portal' when admin. */
async function visibleApps(user: SessionUser): Promise<string[]> {
  const entitlements = await resolveUserEntitlements(user)
  const apps = APP_KEYS.filter((key) => entitlements[key]) as string[]
  if (user.role === 'admin') apps.push('portal')
  return apps
}

export async function listNotifications(user: SessionUser, opts: { limit?: number } = {}): Promise<{ items: FeedNotification[]; unread: number }> {
  const apps = await visibleApps(user)
  if (!apps.length) return { items: [], unread: 0 }
  const limit = Math.min(100, Math.max(1, opts.limit ?? 30))

  const { rows } = await getDb().query(
    `SELECT n.id, n.app, n.severity, n.title, n.body, n.rule_type, n.target, n.created_at,
            (r.user_id IS NOT NULL) AS read
       FROM notifications n
       LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = $2
      WHERE n.app = ANY($1::text[])
      ORDER BY n.created_at DESC
      LIMIT $3`,
    [apps, user.id, limit]
  )

  const { rows: countRows } = await getDb().query(
    `SELECT count(*)::int AS c
       FROM notifications n
       LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = $2
      WHERE n.app = ANY($1::text[]) AND r.user_id IS NULL`,
    [apps, user.id]
  )

  return {
    items: rows.map((r: any) => ({
      id: r.id,
      app: r.app,
      severity: r.severity,
      title: r.title,
      body: r.body,
      ruleType: r.rule_type ?? undefined,
      target: r.target ?? undefined,
      createdAt: r.created_at,
      read: r.read === true
    })),
    unread: Number(countRows[0]?.c ?? 0)
  }
}

/** Mark specific notifications read for this user (ignores ids they can't see). */
export async function markRead(user: SessionUser, ids: string[]): Promise<void> {
  if (!ids.length) return
  const apps = await visibleApps(user)
  if (!apps.length) return
  await getDb().query(
    `INSERT INTO notification_reads (notification_id, user_id, read_at)
     SELECT n.id, $2, $3 FROM notifications n
      WHERE n.id = ANY($1::text[]) AND n.app = ANY($4::text[])
     ON CONFLICT DO NOTHING`,
    [ids, user.id, new Date().toISOString(), apps]
  )
}

/** Mark every notification this user can see as read. */
export async function markAllRead(user: SessionUser): Promise<void> {
  const apps = await visibleApps(user)
  if (!apps.length) return
  await getDb().query(
    `INSERT INTO notification_reads (notification_id, user_id, read_at)
     SELECT n.id, $1, $2 FROM notifications n WHERE n.app = ANY($3::text[])
     ON CONFLICT DO NOTHING`,
    [user.id, new Date().toISOString(), apps]
  )
}
