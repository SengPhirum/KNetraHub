import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { MIGRATIONS } from './migrations'

/**
 * Repeatable, forward-only migrations for the dedicated `pam` schema.
 *
 * Each migration is an ordered list of idempotent SQL statements (IF NOT
 * EXISTS) executed one at a time, so a crash mid-migration re-runs safely.
 * Completion is recorded in pam.schema_migrations so applied migrations are
 * skipped. Memoized per-pool like the monitoring migrator, since several
 * plugins/handlers may call this concurrently at boot.
 */
const migratedPools = new WeakMap<Pool, Promise<void>>()

export function migratePam(db: Pool = getPamDb()): Promise<void> {
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
  await db.query('CREATE SCHEMA IF NOT EXISTS pam')
  await db.query(`
    CREATE TABLE IF NOT EXISTS pam.schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)

  const { rows } = await db.query('SELECT id FROM pam.schema_migrations')
  const applied = new Set(rows.map((r: { id: string }) => r.id))

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    const started = Date.now()
    for (const statement of migration.statements) {
      try {
        await db.query(statement)
      } catch (err: any) {
        if (migration.tolerant?.some((frag) => statement.includes(frag))) {
          console.warn(`[pam:migrate] tolerated failure in ${migration.id}: ${err?.message}`)
          continue
        }
        console.error(`[pam:migrate] ${migration.id} failed on statement:\n${statement.slice(0, 200)}…`)
        throw err
      }
    }
    await db.query('INSERT INTO pam.schema_migrations (id) VALUES ($1) ON CONFLICT DO NOTHING', [migration.id])
    console.log(`[pam:migrate] applied ${migration.id} (${Date.now() - started}ms)`)
  }
}
