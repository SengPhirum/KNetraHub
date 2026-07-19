import { Pool } from 'pg'
import { migrateModuleBase, getDb } from './db'
import { migrateMetrics } from './metrics'
import { encryptSecret } from './secretCrypto'
import {
  closeModuleDb,
  connectionFromRecord,
  ensureModuleDatabaseConfigs,
  getModuleDatabaseRecord,
  getPortalDatabaseConnection,
  refreshModuleDatabaseConfigs,
  type DatabaseConnection,
  type ModuleDatabaseRecord
} from './moduleDb'
import { getBuiltinModule, isBuiltinModuleKey } from '../../shared/moduleCatalog'
import type { AppKey } from '../../shared/utils/entitlements'
import type { ModuleDatabaseMode } from '../../shared/types/module'

export interface ModuleDatabaseInput {
  mode: ModuleDatabaseMode
  database: string
  host?: string
  port?: number
  user?: string
  password?: string
  ssl?: boolean
  adminDatabase?: string
  poolMax?: number
}

const DB_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,62}$/
const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,252}$/

function validateKey(key: string): asserts key is AppKey {
  if (!isBuiltinModuleKey(key)) {
    throw createError({ statusCode: 404, statusMessage: `Unknown built-in module: ${key}` })
  }
}

function validateDatabaseName(value: string): string {
  const name = value.trim()
  if (!DB_NAME_RE.test(name)) {
    throw createError({ statusCode: 400, statusMessage: 'Database name must start with a letter and contain only letters, numbers, underscores, or hyphens (maximum 63 characters)' })
  }
  return name
}

function clampPoolMax(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Connection pool limit must be an integer between 2 and 100' })
  }
  return parsed
}

function poolFor(connection: DatabaseConnection, database = connection.database): Pool {
  return new Pool({
    host: connection.host,
    port: connection.port,
    database,
    user: connection.user,
    password: connection.password,
    ssl: connection.ssl ? { rejectUnauthorized: false } : false,
    max: Math.min(connection.poolMax, 4),
    connectionTimeoutMillis: 10_000
  })
}

function sameDatabase(a: DatabaseConnection, b: DatabaseConnection): boolean {
  const normalizeHost = (value: string) => value.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return normalizeHost(a.host) === normalizeHost(b.host)
    && Number(a.port) === Number(b.port)
    && a.database.trim().toLowerCase() === b.database.trim().toLowerCase()
}

function buildConnection(key: AppKey, input: ModuleDatabaseInput, existing: ModuleDatabaseRecord | null): {
  connection: DatabaseConnection
  stored: Omit<ModuleDatabaseRecord, 'enabled' | 'status' | 'initialized_at' | 'updated_at' | 'updated_by' | 'last_error'>
} {
  const module = getBuiltinModule(key)!
  const database = validateDatabaseName(input.database || module.defaultDatabase)
  const poolMax = clampPoolMax(input.poolMax, module.defaultPoolMax)

  if (input.mode !== 'portal-host' && input.mode !== 'custom-host') {
    throw createError({ statusCode: 400, statusMessage: 'Database host mode must be portal-host or custom-host' })
  }

  if (input.mode === 'portal-host') {
    const base = getPortalDatabaseConnection()
    const connection: DatabaseConnection = {
      ...base,
      database,
      poolMax,
      adminDatabase: input.adminDatabase?.trim() ? validateDatabaseName(input.adminDatabase) : base.database
    }
    return {
      connection,
      stored: {
        module_key: key,
        host_mode: 'portal-host',
        db_host: null,
        db_port: null,
        db_name: database,
        db_user: null,
        db_password_enc: null,
        db_ssl: base.ssl,
        admin_database: connection.adminDatabase,
        pool_max: poolMax
      }
    }
  }

  const host = String(input.host || '').trim()
  const user = String(input.user || '').trim()
  const password = String(input.password || '') || (existing?.host_mode === 'custom-host' ? connectionFromRecord(existing).password : '')
  if (!HOST_RE.test(host)) throw createError({ statusCode: 400, statusMessage: 'A valid custom database host is required' })
  if (!user) throw createError({ statusCode: 400, statusMessage: 'A custom database user is required' })
  if (!password) throw createError({ statusCode: 400, statusMessage: 'A custom database password is required' })

  const connection: DatabaseConnection = {
    host,
    port: Number(input.port || 5432),
    database,
    user,
    password,
    ssl: input.ssl === true,
    poolMax,
    adminDatabase: input.adminDatabase?.trim() ? validateDatabaseName(input.adminDatabase) : 'postgres'
  }
  if (!Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535) {
    throw createError({ statusCode: 400, statusMessage: 'Database port must be between 1 and 65535' })
  }
  return {
    connection,
    stored: {
      module_key: key,
      host_mode: 'custom-host',
      db_host: host,
      db_port: connection.port,
      db_name: database,
      db_user: user,
      db_password_enc: encryptSecret(password),
      db_ssl: connection.ssl,
      admin_database: connection.adminDatabase,
      pool_max: poolMax
    }
  }
}

async function assertDedicatedDatabase(key: AppKey, connection: DatabaseConnection): Promise<void> {
  if (sameDatabase(connection, getPortalDatabaseConnection())) {
    throw createError({ statusCode: 409, statusMessage: 'A subsystem cannot use the portal database. Choose a dedicated database name.' })
  }
  await ensureModuleDatabaseConfigs(true)
  for (const otherKey of ['docker', 'monitoring', 'ipmgt'] as AppKey[]) {
    if (otherKey === key) continue
    const other = await getModuleDatabaseRecord(otherKey)
    if (other?.initialized_at && sameDatabase(connection, connectionFromRecord(other))) {
      throw createError({ statusCode: 409, statusMessage: `${getBuiltinModule(otherKey)?.name} already uses this database. Every subsystem requires its own database.` })
    }
  }
}

async function upsertState(
  key: AppKey,
  stored: ReturnType<typeof buildConnection>['stored'],
  state: { enabled: boolean; status: string; initializedAt: string | null; actor: string; lastError?: string | null }
): Promise<void> {
  await getDb().query(
    `INSERT INTO module_databases
      (module_key, enabled, status, host_mode, db_host, db_port, db_name, db_user, db_password_enc,
       db_ssl, admin_database, pool_max, initialized_at, updated_at, updated_by, last_error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (module_key) DO UPDATE SET
       enabled=EXCLUDED.enabled, status=EXCLUDED.status, host_mode=EXCLUDED.host_mode,
       db_host=EXCLUDED.db_host, db_port=EXCLUDED.db_port, db_name=EXCLUDED.db_name,
       db_user=EXCLUDED.db_user, db_password_enc=EXCLUDED.db_password_enc, db_ssl=EXCLUDED.db_ssl,
       admin_database=EXCLUDED.admin_database, pool_max=EXCLUDED.pool_max,
       initialized_at=EXCLUDED.initialized_at, updated_at=EXCLUDED.updated_at,
       updated_by=EXCLUDED.updated_by, last_error=EXCLUDED.last_error`,
    [key, state.enabled, state.status, stored.host_mode, stored.db_host, stored.db_port, stored.db_name,
      stored.db_user, stored.db_password_enc, stored.db_ssl, stored.admin_database, stored.pool_max,
      state.initializedAt, new Date().toISOString(), state.actor, state.lastError || null]
  )
  await refreshModuleDatabaseConfigs()
}

async function ensureDatabaseExists(connection: DatabaseConnection): Promise<void> {
  const adminPool = poolFor(connection, connection.adminDatabase)
  try {
    const result = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [connection.database])
    if (result.rowCount) return
    const quoted = `"${connection.database.replace(/"/g, '""')}"`
    await adminPool.query(`CREATE DATABASE ${quoted}`)
  } finally {
    await adminPool.end().catch(() => {})
  }
}

async function initializeSchema(key: AppKey, connection: DatabaseConnection): Promise<void> {
  const pool = poolFor(connection)
  try {
    await pool.query('SELECT 1')
    const { rows: markers } = await pool.query(
      `SELECT to_regclass('public.module_databases') AS portal_marker,
              to_regclass('public.knetrahub_module_identity') AS module_marker`
    )
    if (markers[0]?.portal_marker) {
      throw createError({ statusCode: 409, statusMessage: 'The selected database is the KNetraHub portal database and cannot be used by a subsystem' })
    }
    if (markers[0]?.module_marker) {
      const identity = await pool.query('SELECT module_key FROM knetrahub_module_identity LIMIT 1')
      const owner = identity.rows[0]?.module_key
      if (owner && owner !== key) {
        throw createError({ statusCode: 409, statusMessage: `The selected database already belongs to the ${getBuiltinModule(owner)?.name || owner} module` })
      }
    }

    // Reserve ownership before running the potentially long schema bootstrap.
    // If provisioning fails halfway, a retry by this module is safe and a
    // different module can never adopt the partially initialized database.
    await pool.query(
      `CREATE TABLE IF NOT EXISTS knetrahub_module_identity (
         singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
         module_key TEXT UNIQUE NOT NULL,
         initialized_at TEXT NOT NULL
       )`
    )
    await pool.query(
      `INSERT INTO knetrahub_module_identity (singleton, module_key, initialized_at) VALUES (true, $1, $2)
       ON CONFLICT (singleton) DO NOTHING`,
      [key, new Date().toISOString()]
    )
    const reserved = await pool.query('SELECT module_key FROM knetrahub_module_identity WHERE singleton = true')
    const owner = reserved.rows[0]?.module_key
    if (owner !== key) {
      throw createError({ statusCode: 409, statusMessage: `The selected database already belongs to the ${getBuiltinModule(owner)?.name || owner} module` })
    }

    if (key === 'docker') {
      await migrateModuleBase('docker', pool)
      await migrateMetrics(pool, useRuntimeConfig().metrics.retentionDays)
    } else if (key === 'ipmgt') {
      await migrateModuleBase('ipmgt', pool)
    } else {
      const { migrateMonitoring } = await import('../../layers/monitoring/server/db/migrate')
      await migrateMonitoring(pool)
    }
  } finally {
    await pool.end().catch(() => {})
  }
}

async function withLifecycleLock<T>(operation: () => Promise<T>): Promise<T> {
  const client = await getDb().connect()
  const lockName = 'knetrahub.module.lifecycle'
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockName])
    return await operation()
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]).catch(() => {})
    client.release()
  }
}

async function enableModuleUnlocked(keyValue: string, input: ModuleDatabaseInput | null, actor: string): Promise<void> {
  validateKey(keyValue)
  const key = keyValue
  const existing = await getModuleDatabaseRecord(key)

  // Re-enabling an already initialized module does not re-run initialization;
  // this is the explicit first-enable-only contract. Moving an initialized
  // module requires a future, explicit data-relocation workflow rather than
  // silently provisioning an empty replacement database.
  if (input && existing?.initialized_at) {
    throw createError({ statusCode: 409, statusMessage: 'This module has already been initialized. Re-enable it without a new database configuration.' })
  }
  if (!input && existing?.initialized_at) {
    const connection = connectionFromRecord(existing)
    const testPool = poolFor(connection)
    try { await testPool.query('SELECT 1') } finally { await testPool.end().catch(() => {}) }
    const stored = {
      module_key: key,
      host_mode: existing.host_mode,
      db_host: existing.db_host,
      db_port: existing.db_port,
      db_name: existing.db_name,
      db_user: existing.db_user,
      db_password_enc: existing.db_password_enc,
      db_ssl: existing.db_ssl,
      admin_database: existing.admin_database,
      pool_max: existing.pool_max
    }
    await upsertState(key, stored, { enabled: true, status: 'ready', initializedAt: existing.initialized_at, actor })
    return
  }
  if (!input) throw createError({ statusCode: 400, statusMessage: 'Database configuration is required the first time a module is enabled' })

  const { connection, stored } = buildConnection(key, input, existing)
  await assertDedicatedDatabase(key, connection)
  await closeModuleDb(key)
  await upsertState(key, stored, { enabled: false, status: 'initializing', initializedAt: null, actor })

  try {
    await ensureDatabaseExists(connection)
    await initializeSchema(key, connection)
    await upsertState(key, stored, {
      enabled: true,
      status: 'ready',
      initializedAt: new Date().toISOString(),
      actor
    })
  } catch (error: any) {
    const detail = String(error?.message || error).slice(0, 1500)
    await upsertState(key, stored, {
      enabled: false,
      status: 'error',
      initializedAt: existing?.initialized_at || null,
      actor,
      lastError: detail
    }).catch(() => {})
    throw createError({ statusCode: 500, statusMessage: `Could not initialize ${getBuiltinModule(key)?.name}: ${detail}` })
  }
}

async function disableModuleUnlocked(keyValue: string, actor: string): Promise<void> {
  validateKey(keyValue)
  const key = keyValue
  const record = await getModuleDatabaseRecord(key)
  if (!record?.initialized_at) throw createError({ statusCode: 409, statusMessage: 'Module has not been initialized' })
  await getDb().query(
    `UPDATE module_databases
     SET enabled=false, status='disabled', updated_at=$2, updated_by=$3, last_error=NULL
     WHERE module_key=$1`,
    [key, new Date().toISOString(), actor]
  )
  await closeModuleDb(key)
  await refreshModuleDatabaseConfigs()
}

export async function enableModule(keyValue: string, input: ModuleDatabaseInput | null, actor: string): Promise<void> {
  validateKey(keyValue)
  return withLifecycleLock(() => enableModuleUnlocked(keyValue, input, actor))
}

export async function disableModule(keyValue: string, actor: string): Promise<void> {
  validateKey(keyValue)
  return withLifecycleLock(() => disableModuleUnlocked(keyValue, actor))
}
