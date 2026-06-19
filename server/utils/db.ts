import { Pool, types } from 'pg'

// Postgres returns BIGINT (oid 20, e.g. byte counters and COUNT(*)) as JS
// strings by default to avoid silent precision loss above
// Number.MAX_SAFE_INTEGER. Nothing in this app approaches that range, so
// coerce to Number globally rather than at every call site.
types.setTypeParser(20, (val: string) => Number(val))

let _pool: Pool | null = null
let _migrated: Promise<void> | null = null

export function getDb(): Pool {
  if (!_pool) {
    const cfg = useRuntimeConfig().db
    _pool = new Pool({
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      user: cfg.user,
      password: cfg.password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
      max: cfg.poolMax
    })
    _pool.on('error', (err) => {
      console.error('[db] idle pool client error', err)
    })
  }
  return _pool
}

/** Waits for Postgres to accept connections, retrying with backoff. The
 * Postgres/Timescale container may not be ready when the app container
 * starts - there's no reliable depends_on health-gating in a swarm stack
 * deploy, and Timescale's own first-boot init can itself take 10-30s. */
export async function waitForDb(maxAttempts = 30, delayMs = 2000): Promise<void> {
  const db = getDb()
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await db.query('SELECT 1')
      return
    } catch (err) {
      if (attempt === maxAttempts) throw err
      console.warn(`[db] not ready yet (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

/** Runs all app-data DDL migrations. Idempotent (IF NOT EXISTS everywhere)
 * and memoized so repeated calls (from multiple Nitro plugins) are cheap and
 * don't depend on plugin execution order. */
export async function migrate(): Promise<void> {
  if (!_migrated) _migrated = runMigrations()
  return _migrated
}

async function runMigrations(): Promise<void> {
  const db = getDb()

  // App-data tables keep TEXT ISO8601 timestamps (identical to the old
  // SQLite schema) since they're only ever stored/displayed/sorted as
  // strings, never range-queried - only the metrics hypertables (see
  // metrics.ts) need real TIMESTAMPTZ columns for Timescale partitioning.
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'viewer',
      source TEXT NOT NULL DEFAULT 'local',
      password_hash TEXT,
      created_at TEXT NOT NULL,
      last_login TEXT
    );

    -- replaces SQLite's COLLATE NOCASE: case-insensitive uniqueness + lookup
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));

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

    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit (ts DESC);

    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      prefix TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens (token_hash);
  `)
}
