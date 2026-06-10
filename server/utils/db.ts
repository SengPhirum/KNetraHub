import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  const dir = resolve(useRuntimeConfig().dataDir)
  mkdirSync(dir, { recursive: true })
  _db = new Database(join(dir, 'dockhub.db'))
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  _db.pragma('synchronous = NORMAL')
  runMigrations(_db)
  seedFromJson(_db, dir)
  return _db
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      display_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      source TEXT NOT NULL DEFAULT 'local',
      password_hash TEXT,
      created_at TEXT NOT NULL,
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme TEXT NOT NULL DEFAULT 'system',
      refresh_interval INTEGER NOT NULL DEFAULT 0,
      density TEXT NOT NULL DEFAULT 'default',
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS registries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      username TEXT NOT NULL,
      auth TEXT
    );

    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY,
      ts TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      detail TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts DESC);
  `)
}

function seedFromJson(db: Database.Database, dir: string) {
  const jsonFile = join(dir, 'dockhub.json')
  if (!existsSync(jsonFile)) return

  const { n } = db.prepare('SELECT COUNT(*) as n FROM users').get() as { n: number }
  if (n > 0) return

  try {
    const data = JSON.parse(readFileSync(jsonFile, 'utf-8'))
    const iUser = db.prepare(
      'INSERT OR IGNORE INTO users (id, username, display_name, email, role, source, password_hash, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    const iReg = db.prepare('INSERT OR IGNORE INTO registries (id, name, url, username, auth) VALUES (?, ?, ?, ?, ?)')
    const iAudit = db.prepare('INSERT OR IGNORE INTO audit (id, ts, actor, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)')

    db.transaction(() => {
      for (const u of (data.users ?? [])) {
        iUser.run(u.id, u.username, u.displayName, u.email ?? null, u.role, u.source, u.passwordHash ?? null, u.createdAt, u.lastLogin ?? null)
      }
      for (const r of (data.registries ?? [])) {
        iReg.run(r.id, r.name, r.url, r.username, r.auth ?? null)
      }
      for (const a of (data.audit ?? [])) {
        iAudit.run(a.id, a.ts, a.actor, a.action, a.target ?? null, a.detail ?? null)
      }
    })()
  } catch {
    // best-effort JSON migration
  }
}
