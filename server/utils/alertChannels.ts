import { nanoid } from 'nanoid'
import { getDockerDb as getDb } from './moduleDb'
import { encryptSecret, decryptSecret } from './secretCrypto'

export type AlertChannelType = 'telegram' | 'teams' | 'webhook'

export interface AlertChannelSummary {
  id: string
  name: string
  type: AlertChannelType
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface AlertChannelWithConfig extends AlertChannelSummary {
  config: Record<string, any>
}

function rowToSummary(r: any): AlertChannelSummary {
  return { id: r.id, name: r.name, type: r.type, enabled: r.enabled, createdAt: r.created_at, updatedAt: r.updated_at }
}

/** Never includes config - there's no safe partial-display value for a bot token or webhook URL. */
export async function listAlertChannels(): Promise<AlertChannelSummary[]> {
  const { rows } = await getDb().query('SELECT id, name, type, enabled, created_at, updated_at FROM alert_channels ORDER BY name')
  return rows.map(rowToSummary)
}

/** Internal use only (notifier, test-send) - never returned from an API response. */
export async function listAlertChannelsWithConfig(): Promise<AlertChannelWithConfig[]> {
  const { rows } = await getDb().query('SELECT * FROM alert_channels ORDER BY name')
  return rows.map((r: any) => ({ ...rowToSummary(r), config: JSON.parse(decryptSecret(r.config) || '{}') }))
}

export async function getAlertChannelWithConfig(id: string): Promise<AlertChannelWithConfig | null> {
  const { rows } = await getDb().query('SELECT * FROM alert_channels WHERE id = $1', [id])
  const r = rows[0]
  if (!r) return null
  return { ...rowToSummary(r), config: JSON.parse(decryptSecret(r.config) || '{}') }
}

export async function createAlertChannel(input: { name: string; type: AlertChannelType; enabled: boolean; config: Record<string, any> }): Promise<AlertChannelSummary> {
  const id = nanoid()
  const now = new Date().toISOString()
  await getDb().query(
    'INSERT INTO alert_channels (id, name, type, enabled, config, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, input.name, input.type, input.enabled, encryptSecret(JSON.stringify(input.config)), now, now]
  )
  return { id, name: input.name, type: input.type, enabled: input.enabled, createdAt: now, updatedAt: now }
}

/** Blank/omitted config fields in the patch keep their current value (same "leave blank to keep" convention as other secrets). */
export async function updateAlertChannel(id: string, patch: Partial<{ name: string; enabled: boolean; config: Record<string, any> }>): Promise<AlertChannelSummary> {
  const existing = await getAlertChannelWithConfig(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Channel not found' })
  const now = new Date().toISOString()
  const name = patch.name ?? existing.name
  const enabled = patch.enabled ?? existing.enabled
  const mergedConfig = { ...existing.config }
  if (patch.config) {
    for (const [k, v] of Object.entries(patch.config)) {
      if (v !== '' && v !== undefined && v !== null) mergedConfig[k] = v
    }
  }
  await getDb().query(
    'UPDATE alert_channels SET name = $1, enabled = $2, config = $3, updated_at = $4 WHERE id = $5',
    [name, enabled, encryptSecret(JSON.stringify(mergedConfig)), now, id]
  )
  return { id, name, type: existing.type, enabled, createdAt: existing.createdAt, updatedAt: now }
}

export async function deleteAlertChannel(id: string): Promise<void> {
  await getDb().query('DELETE FROM alert_channels WHERE id = $1', [id])
}
