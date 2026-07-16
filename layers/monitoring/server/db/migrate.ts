import { getDb, waitForDb } from '~~/server/utils/db'
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
let _migrated: Promise<void> | null = null

export function migrateMonitoring(): Promise<void> {
  if (!_migrated) {
    _migrated = run().catch((err) => {
      _migrated = null
      throw err
    })
  }
  return _migrated
}

async function run(): Promise<void> {
  await waitForDb()
  const db = getDb()

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
