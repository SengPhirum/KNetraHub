import { Pool, type PoolConfig } from 'pg'
import { getDb } from './db'
import { decryptSecret } from './secretCrypto'
import { BUILTIN_MODULES, getBuiltinModule } from '../../shared/moduleCatalog'
import type { AppKey } from '../../shared/utils/entitlements'
import type { ModuleDatabaseMode, ModuleRuntimeState } from '../../shared/types/module'

export interface ModuleDatabaseRecord {
  module_key: AppKey
  enabled: boolean
  status: 'disabled' | 'initializing' | 'ready' | 'error'
  host_mode: ModuleDatabaseMode
  db_host: string | null
  db_port: number | null
  db_name: string
  db_user: string | null
  db_password_enc: string | null
  db_ssl: boolean
  admin_database: string | null
  pool_max: number
  initialized_at: string | null
  updated_at: string
  updated_by: string | null
  last_error: string | null
}

export interface DatabaseConnection {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
  poolMax: number
  adminDatabase: string
}

let records = new Map<AppKey, ModuleDatabaseRecord>()
let loaded: Promise<void> | null = null
const pools = new Map<AppKey, { fingerprint: string; pool: Pool }>()
const runtimeSuspensions = new Set<AppKey>()

function portalConnection(database?: string): DatabaseConnection {
  const cfg = useRuntimeConfig().db as Record<string, any>
  return {
    host: String(cfg.host),
    port: Number(cfg.port),
    database: database || String(cfg.database),
    user: String(cfg.user),
    password: String(cfg.password),
    ssl: cfg.ssl === true,
    poolMax: Number(cfg.poolMax || 20),
    adminDatabase: String(cfg.database)
  }
}

export function getPortalDatabaseConnection(): DatabaseConnection {
  return portalConnection()
}

export async function ensureModuleDatabaseConfigs(force = false): Promise<void> {
  if (force) loaded = null
  if (!loaded) {
    loaded = (async () => {
      const { rows } = await getDb().query('SELECT * FROM module_databases')
      const next = new Map<AppKey, ModuleDatabaseRecord>()
      for (const row of rows as ModuleDatabaseRecord[]) {
        if (getBuiltinModule(row.module_key)) next.set(row.module_key, row)
      }

      for (const [key, current] of pools) {
        const record = next.get(key)
        if (!record || !record.enabled || record.status !== 'ready') {
          await current.pool.end().catch(() => {})
          pools.delete(key)
          continue
        }
        const connection = connectionFromRecord(record)
        if (current.fingerprint !== connectionFingerprint(connection)) {
          await current.pool.end().catch(() => {})
          pools.delete(key)
        }
      }
      records = next
    })().catch((error) => {
      loaded = null
      throw error
    })
  }
  await loaded
}

export async function refreshModuleDatabaseConfigs(): Promise<void> {
  await ensureModuleDatabaseConfigs(true)
}

export function connectionFromRecord(record: ModuleDatabaseRecord): DatabaseConnection {
  if (record.host_mode === 'portal-host') {
    const base = portalConnection(record.db_name)
    return {
      ...base,
      poolMax: Number(record.pool_max || getBuiltinModule(record.module_key)?.defaultPoolMax || 20),
      adminDatabase: record.admin_database || base.adminDatabase
    }
  }
  return {
    host: String(record.db_host || ''),
    port: Number(record.db_port || 5432),
    database: record.db_name,
    user: String(record.db_user || ''),
    password: decryptSecret(record.db_password_enc),
    ssl: record.db_ssl === true,
    poolMax: Number(record.pool_max || getBuiltinModule(record.module_key)?.defaultPoolMax || 20),
    adminDatabase: record.admin_database || 'postgres'
  }
}

export async function getModuleDatabaseRecord(key: AppKey): Promise<ModuleDatabaseRecord | null> {
  await ensureModuleDatabaseConfigs()
  return records.get(key) || null
}

export async function getModuleDatabaseConnection(key: AppKey): Promise<DatabaseConnection> {
  const record = await getModuleDatabaseRecord(key)
  if (!record?.initialized_at) {
    throw createError({ statusCode: 409, statusMessage: `${getBuiltinModule(key)?.name || key} database has not been initialized` })
  }
  return connectionFromRecord(record)
}

function poolConfig(connection: DatabaseConnection): PoolConfig {
  return {
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ssl: connection.ssl ? { rejectUnauthorized: false } : false,
    max: connection.poolMax
  }
}

function connectionFingerprint(connection: DatabaseConnection): string {
  return JSON.stringify([
    connection.host, connection.port, connection.database, connection.user,
    connection.password, connection.ssl, connection.poolMax
  ])
}

export function getModuleDb(key: AppKey): Pool {
  if (runtimeSuspensions.has(key)) {
    throw createError({ statusCode: 503, statusMessage: `${getBuiltinModule(key)?.name || key} module is temporarily suspended` })
  }
  const record = records.get(key)
  if (!record?.enabled || record.status !== 'ready' || !record.initialized_at) {
    throw createError({ statusCode: 503, statusMessage: `${getBuiltinModule(key)?.name || key} module is not enabled` })
  }
  const connection = connectionFromRecord(record)
  const fingerprint = connectionFingerprint(connection)
  const current = pools.get(key)
  if (current?.fingerprint === fingerprint) return current.pool

  const pool = new Pool(poolConfig(connection))
  pool.on('error', (error) => console.error(`[db:${key}] idle pool client error`, error))
  pools.set(key, { fingerprint, pool })
  return pool
}

export const getDockerDb = () => getModuleDb('docker')
export const getMonitoringDb = () => getModuleDb('monitoring')
export const getIpamDb = () => getModuleDb('ipmgt')
export const getPamDb = () => getModuleDb('pam')
export const getWorkDb = () => getModuleDb('work')

export async function isModuleEnabled(key: AppKey): Promise<boolean> {
  if (runtimeSuspensions.has(key)) return false
  await ensureModuleDatabaseConfigs()
  const record = records.get(key)
  return record?.enabled === true && record.status === 'ready' && !!record.initialized_at
}

export async function enabledModuleKeys(): Promise<Set<AppKey>> {
  await ensureModuleDatabaseConfigs()
  return new Set(
    [...records.values()]
      .filter((record) => !runtimeSuspensions.has(record.module_key) && record.enabled && record.status === 'ready' && record.initialized_at)
      .map((record) => record.module_key)
  )
}

export async function listModuleRuntimeStates(includeDatabase = false): Promise<ModuleRuntimeState[]> {
  await ensureModuleDatabaseConfigs()
  return BUILTIN_MODULES.map((module) => {
    const record = records.get(module.key as AppKey)
    const connection = includeDatabase && record ? connectionFromRecord(record) : null
    return {
      key: module.key,
      enabled: record?.enabled === true && record.status === 'ready',
      status: record?.status || 'disabled',
      initializedAt: record?.initialized_at || null,
      updatedAt: record?.updated_at || null,
      updatedBy: record?.updated_by || null,
      lastError: record?.last_error || null,
      database: includeDatabase && record && connection
        ? {
            mode: record.host_mode,
            host: connection.host,
            port: connection.port,
            database: connection.database,
            user: connection.user,
            ssl: connection.ssl,
            poolMax: connection.poolMax,
            passwordSet: !!connection.password
          }
        : null
    }
  })
}

export async function closeModuleDb(key: AppKey): Promise<void> {
  const current = pools.get(key)
  if (!current) return
  pools.delete(key)
  await current.pool.end().catch(() => {})
}

export async function closeAllModuleDbs(): Promise<void> {
  await Promise.all([...pools.values()].map(({ pool }) => pool.end().catch(() => {})))
  pools.clear()
}

export function suspendModuleRuntime(key: AppKey): void {
  runtimeSuspensions.add(key)
}

export function resumeModuleRuntime(key: AppKey): void {
  runtimeSuspensions.delete(key)
}
