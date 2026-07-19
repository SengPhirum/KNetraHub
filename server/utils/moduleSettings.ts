import type { Pool } from 'pg'
import { getDockerDb, getIpamDb } from './moduleDb'

type SettingsOwner = 'docker' | 'ipmgt'

function database(owner: SettingsOwner): { db: Pool; table: string } {
  if (owner === 'docker') return { db: getDockerDb(), table: 'docker_settings' }
  return { db: getIpamDb(), table: 'ipmgt_settings' }
}

/** Settings owned by a subsystem stay inside that subsystem's database. */
export async function getModuleSetting(owner: SettingsOwner, key: string): Promise<string | null> {
  const { db, table } = database(owner)
  const { rows } = await db.query(`SELECT value FROM ${table} WHERE key = $1`, [key])
  return rows[0]?.value ?? null
}

export async function setModuleSetting(owner: SettingsOwner, key: string, value: string, actor: string): Promise<void> {
  const { db, table } = database(owner)
  await db.query(
    `INSERT INTO ${table} (key, value, updated_at, updated_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
    [key, value, new Date().toISOString(), actor]
  )
}

export async function deleteModuleSetting(owner: SettingsOwner, key: string): Promise<void> {
  const { db, table } = database(owner)
  await db.query(`DELETE FROM ${table} WHERE key = $1`, [key])
}
