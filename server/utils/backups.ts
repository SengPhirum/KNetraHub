import { spawn } from 'node:child_process'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { nanoid } from 'nanoid'
import { getDb } from './db'
import {
  getModuleDatabaseConnection,
  getModuleDatabaseRecord,
  getPortalDatabaseConnection,
  type DatabaseConnection
} from './moduleDb'
import { BUILTIN_MODULES } from '../../shared/moduleCatalog'
import type { AppKey } from '../../shared/utils/entitlements'

/**
 * Database backup & restore (Admin > System > Maintenance > Backup & Restore).
 * PostgreSQL custom-format dumps via pg_dump / pg_restore, written to a
 * server-side directory and listed for download/deletion. Documents and
 * search-index backup targets are deliberately not implemented — the portal
 * has no document library; the database dump covers everything.
 *
 * Requires the postgresql client binaries in the runtime image (see
 * docker/Dockerfile: postgresql17-client, matching the TimescaleDB pg17
 * server).
 */

export interface BackupFile {
  name: string
  target: BackupTarget
  size_bytes: number
  created_at: string
}

export type BackupTarget = 'portal' | AppKey

export interface BackupTargetInfo {
  key: BackupTarget
  label: string
  database: string
  enabled: boolean
}

export interface BackupLogEntry {
  id: string
  ts: string
  operation: string
  target: string
  filename: string | null
  actor: string
  size_bytes: number | null
  status: string
  detail: string | null
}

// Filenames we create are timestamped; anything downloaded/deleted/restored
// must match this shape — blocks path traversal and foreign files.
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.dump$/

export function isSafeBackupName(name: string): boolean {
  return NAME_RE.test(name) && !name.includes('..')
}

export function backupTargetFromName(name: string): BackupTarget {
  const prefix = name.split('__', 1)[0]
  if (prefix === 'docker' || prefix === 'monitoring' || prefix === 'ipmgt' || prefix === 'portal') return prefix
  return 'portal' // legacy backups created before database separation
}

export function isBackupTarget(value: unknown): value is BackupTarget {
  return value === 'portal' || value === 'docker' || value === 'monitoring' || value === 'ipmgt'
}

export function backupDir(): string {
  const cfg = useRuntimeConfig().backups as { dir?: string }
  return resolve(cfg?.dir || join(process.cwd(), 'data', 'backups'))
}

export async function ensureBackupDir(): Promise<string> {
  const dir = backupDir()
  await mkdir(dir, { recursive: true })
  return dir
}

export async function listBackups(): Promise<BackupFile[]> {
  const dir = await ensureBackupDir()
  const names = await readdir(dir)
  const out: BackupFile[] = []
  for (const name of names) {
    if (!isSafeBackupName(name)) continue
    try {
      const s = await stat(join(dir, name))
      if (!s.isFile()) continue
      out.push({ name, target: backupTargetFromName(name), size_bytes: s.size, created_at: s.mtime.toISOString() })
    } catch { /* raced deletion */ }
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function deleteBackup(name: string): Promise<void> {
  if (!isSafeBackupName(name)) throw createError({ statusCode: 400, statusMessage: 'invalid backup filename' })
  await unlink(join(backupDir(), name))
}

// ─── pg_dump / pg_restore ────────────────────────────────────────────────────

async function targetConnection(target: BackupTarget): Promise<DatabaseConnection> {
  return target === 'portal' ? getPortalDatabaseConnection() : getModuleDatabaseConnection(target)
}

export async function listBackupTargets(): Promise<BackupTargetInfo[]> {
  const portal = getPortalDatabaseConnection()
  const targets: BackupTargetInfo[] = [{ key: 'portal', label: 'KNetraHub Portal', database: portal.database, enabled: true }]
  for (const module of BUILTIN_MODULES) {
    const record = await getModuleDatabaseRecord(module.key as AppKey)
    if (!record?.initialized_at) continue
    targets.push({ key: module.key as AppKey, label: module.name, database: record.db_name, enabled: record.enabled && record.status === 'ready' })
  }
  return targets
}

async function dbEnv(target: BackupTarget): Promise<{ args: string[]; env: NodeJS.ProcessEnv; connection: DatabaseConnection }> {
  const cfg = await targetConnection(target)
  return {
    args: ['-h', cfg.host, '-p', String(cfg.port), '-U', cfg.user, '-d', cfg.database],
    env: { ...process.env, PGPASSWORD: cfg.password, ...(cfg.ssl ? { PGSSLMODE: 'require' } : {}) },
    connection: cfg
  }
}

function runPg(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += String(d) })
    child.on('error', (err) => {
      // ENOENT = binary missing from the image — say so explicitly.
      reject(new Error((err as any)?.code === 'ENOENT'
        ? `${cmd} is not installed in this container (postgresql client tools required)`
        : String(err?.message ?? err)))
    })
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-800) || 'no error output'}`))
    })
  })
}

/** Create a custom-format dump of the whole database (all schemas, including monitoring). */
export async function createDatabaseBackup(target: BackupTarget): Promise<BackupFile> {
  const dir = await ensureBackupDir()
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/^(\d{8})(\d{6}).*/, '$1_$2')
  const { args, env, connection } = await dbEnv(target)
  const name = `${target}__${connection.database}_${stamp}.dump`
  const file = join(dir, name)
  await runPg('pg_dump', [...args, '-Fc', '--no-owner', '-f', file], env)
  const s = await stat(file)
  return { name, target, size_bytes: s.size, created_at: s.mtime.toISOString() }
}

/**
 * Restore a custom-format dump into the running database. --clean --if-exists
 * drops and recreates objects; errors from statements against objects that a
 * live app is still touching are tolerated by pg_restore's default behaviour
 * only when exit code is 0 — we treat a non-zero exit as failure and surface
 * stderr. Enabling Maintenance Mode first is strongly recommended.
 */
export async function restoreDatabaseBackup(target: BackupTarget, file: string): Promise<void> {
  const { args, env } = await dbEnv(target)
  await runPg('pg_restore', [...args, '--clean', '--if-exists', '--no-owner', '--no-privileges', file], env)
}

// ─── activity log ────────────────────────────────────────────────────────────

export async function logBackupOp(entry: {
  operation: 'backup' | 'restore' | 'delete'
  target: string
  filename?: string | null
  actor: string
  sizeBytes?: number | null
  status: 'success' | 'failed'
  detail?: string | null
}): Promise<void> {
  await getDb().query(
    `INSERT INTO backup_log (id, ts, operation, target, filename, actor, size_bytes, status, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [nanoid(), new Date().toISOString(), entry.operation, entry.target, entry.filename ?? null,
      entry.actor, entry.sizeBytes ?? null, entry.status, entry.detail ?? null]
  )
}

export async function listBackupLog(limit = 100): Promise<BackupLogEntry[]> {
  const { rows } = await getDb().query('SELECT * FROM backup_log ORDER BY ts DESC LIMIT $1', [limit])
  return rows as BackupLogEntry[]
}
