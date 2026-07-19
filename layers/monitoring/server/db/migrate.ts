import type { Pool } from 'pg'
import { getMonitoringDb } from '~~/server/utils/moduleDb'
import { MIGRATIONS } from './migrations'

/**
 * Repeatable, forward-only migrations for the dedicated `monitoring` schema.
 *
 * Each migration is an ordered list of SQL statements executed one at a time
 * (NOT inside one wrapping transaction — TimescaleDB continuous aggregates
 * cannot be created transactionally). Statements are idempotent (IF NOT
 * EXISTS) so a crash mid-migration re-runs safely; completion is recorded in
 * monitoring.schema_migrations so completed migrations are skipped entirely.
 *
 * Memoized like the portal's migrate(): several plugins/handlers may call
 * this concurrently at boot.
 */
const migratedPools = new WeakMap<Pool, Promise<void>>()

export function migrateMonitoring(db: Pool = getMonitoringDb()): Promise<void> {
  let pending = migratedPools.get(db)
  if (!pending) {
    pending = run(db).catch((err) => {
      migratedPools.delete(db)
      throw err
    })
    migratedPools.set(db, pending)
  }
  return pending
}

async function run(db: Pool): Promise<void> {
  // Monitoring's time-series tables require TimescaleDB in this dedicated
  // database. Provisioning fails clearly when a custom host lacks the
  // extension instead of leaving a half-enabled subsystem.
  await db.query('CREATE EXTENSION IF NOT EXISTS timescaledb')
  await db.query('CREATE SCHEMA IF NOT EXISTS monitoring')
  await db.query(`
    CREATE TABLE IF NOT EXISTS monitoring.schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)

  const { rows } = await db.query('SELECT id FROM monitoring.schema_migrations')
  const applied = new Set(rows.map((r: { id: string }) => r.id))

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    const started = Date.now()
    for (const statement of migration.statements) {
      try {
        await db.query(statement)
      } catch (err: any) {
        // Optional statements (Timescale compression/retention on editions
        // that lack them) may be marked tolerant; everything else is fatal.
        if (migration.tolerant?.some((frag) => statement.includes(frag))) {
          console.warn(`[monitoring:migrate] tolerated failure in ${migration.id}: ${err?.message}`)
          continue
        }
        console.error(`[monitoring:migrate] ${migration.id} failed on statement:\n${statement.slice(0, 200)}…`)
        throw err
      }
    }
    await db.query('INSERT INTO monitoring.schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING', [migration.id])
    console.log(`[monitoring:migrate] applied ${migration.id} (${Date.now() - started}ms)`)
  }
}
