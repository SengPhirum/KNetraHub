import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam } from '~~/layers/pam/server/utils/pamStore'
import { activeKeyVersion } from '~~/layers/pam/server/utils/pamCrypto'

/** Component/dependency health for the PAM status page. */
export default defineEventHandler(async (event) => {
  await requirePam(event, 'viewer')
  const db = getPamDb()
  const [jobs, gateways, deadJobs] = await Promise.all([
    db.query("SELECT status, count(*)::int c FROM pam.credential_jobs GROUP BY status"),
    db.query('SELECT g.id, g.name, g.kind, g.enabled, g.drain_mode, gh.status, gh.reported_at FROM pam.gateways g LEFT JOIN LATERAL (SELECT status, reported_at FROM pam.gateway_health h WHERE h.gateway_id = g.id ORDER BY reported_at DESC LIMIT 1) gh ON true ORDER BY g.name'),
    db.query("SELECT count(*)::int c FROM pam.credential_jobs WHERE status='dead'")
  ])
  const jobsByStatus = Object.fromEntries(jobs.rows.map((r) => [r.status, r.c]))
  return {
    ok: true,
    vault: { keyVersion: activeKeyVersion(), available: true },
    jobs: jobsByStatus,
    deadJobs: deadJobs.rows[0].c,
    gateways: gateways.rows,
    checkedAt: new Date().toISOString()
  }
})
