import { nanoid } from 'nanoid'
import { getDb } from './db'
import { encryptSecret, decryptSecret } from './secretCrypto'
import { NOTIFICATION_SCOPE_GLOBAL } from '../../shared/utils/notifications'

/**
 * CRUD for the centralized notification library (portal DB). Channel config is
 * AES-encrypted at rest and never returned by the list/summary reads - only the
 * delivery engine and the "test" action decrypt it. `scope` is 'global' or an
 * app key; channelsForScope returns global + that app's enabled channels.
 */

export interface NotificationChannelSummary {
  id: string
  name: string
  type: string
  scope: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}
export interface NotificationChannel extends NotificationChannelSummary {
  config: Record<string, any>
}

function rowToSummary(r: any): NotificationChannelSummary {
  return { id: r.id, name: r.name, type: r.type, scope: r.scope, enabled: r.enabled === true, createdAt: r.created_at, updatedAt: r.updated_at }
}
function rowToChannel(r: any): NotificationChannel {
  return { ...rowToSummary(r), config: JSON.parse(decryptSecret(r.config) || '{}') }
}

/** Summaries only (never config). Optionally filter to one scope. */
export async function listChannels(scope?: string): Promise<NotificationChannelSummary[]> {
  const { rows } = scope
    ? await getDb().query('SELECT id, name, type, scope, enabled, created_at, updated_at FROM notification_channels WHERE scope = $1 ORDER BY name', [scope])
    : await getDb().query('SELECT id, name, type, scope, enabled, created_at, updated_at FROM notification_channels ORDER BY scope, name')
  return rows.map(rowToSummary)
}

export async function getChannelWithConfig(id: string): Promise<NotificationChannel | null> {
  const { rows } = await getDb().query('SELECT * FROM notification_channels WHERE id = $1', [id])
  return rows[0] ? rowToChannel(rows[0]) : null
}

/** Enabled channels an app delivers to: its own app-scoped channels, plus the
 *  Global channels it has opted in to (notification_channel_apps). */
export async function channelsForScope(scope: string): Promise<NotificationChannel[]> {
  const { rows } = await getDb().query(
    `SELECT c.* FROM notification_channels c
      WHERE c.enabled = true AND (
        c.scope = $1
        OR (c.scope = $2 AND EXISTS (
          SELECT 1 FROM notification_channel_apps a WHERE a.channel_id = c.id AND a.app_key = $1
        ))
      )
      ORDER BY c.name`,
    [scope, NOTIFICATION_SCOPE_GLOBAL]
  )
  return rows.map(rowToChannel)
}

/** Global channels with a `selected` flag for the given app - drives the app's
 *  "use pre-configured" picker. Summaries only (no config). */
export async function listGlobalChannelsForApp(app: string): Promise<Array<NotificationChannelSummary & { selected: boolean }>> {
  const { rows } = await getDb().query(
    `SELECT c.id, c.name, c.type, c.scope, c.enabled, c.created_at, c.updated_at,
            (a.app_key IS NOT NULL) AS selected
       FROM notification_channels c
       LEFT JOIN notification_channel_apps a ON a.channel_id = c.id AND a.app_key = $1
      WHERE c.scope = $2
      ORDER BY c.name`,
    [app, NOTIFICATION_SCOPE_GLOBAL]
  )
  return rows.map((r: any) => ({ ...rowToSummary(r), selected: r.selected === true }))
}

/** Opt an app in or out of using a Global channel. */
export async function setChannelApp(channelId: string, app: string, use: boolean): Promise<void> {
  if (use) {
    await getDb().query(
      'INSERT INTO notification_channel_apps (channel_id, app_key) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [channelId, app]
    )
  } else {
    await getDb().query('DELETE FROM notification_channel_apps WHERE channel_id = $1 AND app_key = $2', [channelId, app])
  }
}

export async function createChannel(input: { name: string; type: string; scope: string; enabled: boolean; config: Record<string, any> }): Promise<NotificationChannelSummary> {
  const id = nanoid()
  const now = new Date().toISOString()
  await getDb().query(
    'INSERT INTO notification_channels (id, name, type, scope, enabled, config, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
    [id, input.name, input.type, input.scope || NOTIFICATION_SCOPE_GLOBAL, input.enabled, encryptSecret(JSON.stringify(input.config || {})), now]
  )
  return { id, name: input.name, type: input.type, scope: input.scope || NOTIFICATION_SCOPE_GLOBAL, enabled: input.enabled, createdAt: now, updatedAt: now }
}

/** Blank/omitted config fields keep their current value ("leave blank to keep"). */
export async function updateChannel(id: string, patch: Partial<{ name: string; scope: string; enabled: boolean; config: Record<string, any> }>): Promise<NotificationChannelSummary> {
  const existing = await getChannelWithConfig(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  const now = new Date().toISOString()
  const name = patch.name ?? existing.name
  const scope = patch.scope ?? existing.scope
  const enabled = patch.enabled ?? existing.enabled
  const config = { ...existing.config }
  if (patch.config) {
    for (const [k, v] of Object.entries(patch.config)) {
      if (v !== '' && v !== undefined && v !== null) config[k] = v
    }
  }
  await getDb().query(
    'UPDATE notification_channels SET name = $1, scope = $2, enabled = $3, config = $4, updated_at = $5 WHERE id = $6',
    [name, scope, enabled, encryptSecret(JSON.stringify(config)), now, id]
  )
  return { id, name, type: existing.type, scope, enabled, createdAt: existing.createdAt, updatedAt: now }
}

export async function deleteChannel(id: string): Promise<void> {
  await getDb().query('DELETE FROM notification_channels WHERE id = $1', [id])
}

// ── Templates ────────────────────────────────────────────────────────────────

export interface NotificationTemplate {
  id: string
  name: string
  scope: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
}
function rowToTemplate(r: any): NotificationTemplate {
  return { id: r.id, name: r.name, scope: r.scope, title: r.title, body: r.body, createdAt: r.created_at, updatedAt: r.updated_at }
}

export async function listTemplates(scope?: string): Promise<NotificationTemplate[]> {
  const { rows } = scope
    ? await getDb().query('SELECT * FROM notification_templates WHERE scope = $1 ORDER BY name', [scope])
    : await getDb().query('SELECT * FROM notification_templates ORDER BY scope, name')
  return rows.map(rowToTemplate)
}

export async function getTemplate(id: string): Promise<NotificationTemplate | null> {
  const { rows } = await getDb().query('SELECT * FROM notification_templates WHERE id = $1', [id])
  return rows[0] ? rowToTemplate(rows[0]) : null
}

export async function createTemplate(input: { name: string; scope: string; title: string; body: string }): Promise<NotificationTemplate> {
  const id = nanoid()
  const now = new Date().toISOString()
  await getDb().query(
    'INSERT INTO notification_templates (id, name, scope, title, body, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)',
    [id, input.name, input.scope || NOTIFICATION_SCOPE_GLOBAL, input.title, input.body, now]
  )
  return { id, name: input.name, scope: input.scope || NOTIFICATION_SCOPE_GLOBAL, title: input.title, body: input.body, createdAt: now, updatedAt: now }
}

export async function updateTemplate(id: string, patch: Partial<{ name: string; scope: string; title: string; body: string }>): Promise<NotificationTemplate> {
  const existing = await getTemplate(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  const now = new Date().toISOString()
  const merged = {
    name: patch.name ?? existing.name,
    scope: patch.scope ?? existing.scope,
    title: patch.title ?? existing.title,
    body: patch.body ?? existing.body
  }
  await getDb().query(
    'UPDATE notification_templates SET name = $1, scope = $2, title = $3, body = $4, updated_at = $5 WHERE id = $6',
    [merged.name, merged.scope, merged.title, merged.body, now, id]
  )
  return { id, ...merged, createdAt: existing.createdAt, updatedAt: now }
}

export async function deleteTemplate(id: string): Promise<void> {
  await getDb().query('DELETE FROM notification_templates WHERE id = $1', [id])
}
