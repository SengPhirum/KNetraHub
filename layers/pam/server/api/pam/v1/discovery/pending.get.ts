import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

/** Pending discovered-account queue + discovery source/run summary (pam.discovery.view). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.discovery.view')
  const db = getPamDb()
  const [pending, sources, runs] = await Promise.all([
    db.query("SELECT * FROM pam.discovered_accounts WHERE status='pending' ORDER BY last_seen DESC LIMIT 300"),
    db.query('SELECT id, name, source_type, enabled, last_run_at, last_status FROM pam.discovery_sources ORDER BY name'),
    db.query('SELECT id, source_id, trigger, status, started_at, finished_at, accounts_found, new_accounts FROM pam.discovery_runs ORDER BY started_at DESC LIMIT 20')
  ])
  return {
    pending: pending.rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null })),
    sources: sources.rows,
    runs: runs.rows
  }
})
