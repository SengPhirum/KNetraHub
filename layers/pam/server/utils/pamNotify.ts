import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { recordNotification } from '~~/server/utils/notificationFeed'
import { newId, nowIso } from './pamStore'

/**
 * PAM notification bridge. Every PAM alert is written to the in-schema
 * pam.notifications log AND the central portal notification feed (the navbar
 * bell), so entitled users see it in one place. Passwords, tokens, keys,
 * secret values and session connection tokens must NEVER appear here.
 */

export type PamNotifySeverity = 'info' | 'warning' | 'critical'

export interface PamNotifyInput {
  severity: PamNotifySeverity
  event: string
  title: string
  body: string
  objectType?: string | null
  objectId?: string | null
  link?: string | null
}

export async function pamNotify(input: PamNotifyInput, db: Pool = getPamDb()): Promise<void> {
  try {
    await db.query(
      `INSERT INTO pam.notifications (id, severity, event, title, body, object_type, object_id, link, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [newId(), input.severity, input.event, input.title, input.body,
        input.objectType ?? null, input.objectId ?? null, input.link ?? null, nowIso()]
    )
  } catch (err: any) {
    console.error('[pam:notify] failed to write pam.notifications', err?.message)
  }
  // Central feed (best-effort; feed failures never surface).
  await recordNotification({
    app: 'pam' as any,
    severity: input.severity,
    title: input.title,
    body: input.body,
    ruleType: input.event,
    target: input.link ?? null
  }).catch(() => {})
}
