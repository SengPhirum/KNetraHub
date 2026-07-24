import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { nanoid } from 'nanoid'
import { createHash } from 'node:crypto'
import { migratePam } from '../../../layers/pam/server/db/migrate'
import { runReportToStore, getRunContent, listRuns, createSchedule, runDueReportSchedules, listSchedules } from '../../../layers/pam/server/utils/pamReports'

/**
 * Proves server-side compliance reporting (spec §13): real XLSX generated
 * server-side, stored as an evidence snapshot with a verifiable sha256, and
 * re-downloadable byte-for-byte; plus the scheduler (claim → generate → deliver
 * → advance next_run_at) and the EXTERNALLY-CONSTRAINED email channel skip.
 */
const DSN = process.env.PAM_TEST_DATABASE_URL || 'postgres://pam:pam@localhost:55432/pam_test'
let pool: Pool
const now = () => new Date().toISOString()
const past = () => new Date(Date.now() - 60000).toISOString()

beforeAll(async () => {
  pool = new Pool({ connectionString: DSN, max: 4 })
  await pool.query('SELECT 1')
  await pool.query('DROP SCHEMA IF EXISTS pam CASCADE')
  await migratePam(pool)
  const safeId = nanoid()
  await pool.query("INSERT INTO pam.safes (id,name,slug,created_at) VALUES ($1,'Prod',$2,$3)", [safeId, `s-${safeId}`, now()])
  for (const n of ['root', 'admin', 'svc']) {
    await pool.query("INSERT INTO pam.accounts (id,name,username,safe_id,account_type,criticality,created_at) VALUES ($1,$2,$3,$4,'generic','high',$5)",
      [nanoid(), `${n}@host`, n, safeId, now()])
  }
}, 120000)
afterAll(async () => { await pool?.end().catch(() => {}) })

describe('server-side generation + stored evidence', () => {
  it('generates a real XLSX, stores it with a matching sha256, and re-downloads identical bytes', async () => {
    const run = await runReportToStore('account-inventory', { format: 'xlsx', actor: 'auditor' }, pool)
    expect(run.rowCount).toBe(3)
    expect(run.sizeBytes).toBeGreaterThan(0)

    const file = await getRunContent(run.id, pool)
    expect(file).toBeTruthy()
    expect(file!.content.subarray(0, 2).toString('latin1')).toBe('PK') // valid xlsx (zip)
    expect(createHash('sha256').update(file!.content).digest('hex')).toBe(run.checksum)

    const runs = await listRuns('account-inventory', 10, pool)
    expect(runs.find((r) => r.id === run.id)).toBeTruthy()
  })

  it('generates CSV with a header and one row per account', async () => {
    const run = await runReportToStore('account-inventory', { format: 'csv', actor: 'auditor' }, pool)
    const csv = (await getRunContent(run.id, pool))!.content.toString('utf8')
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toContain('name')
    expect(lines.length).toBe(4) // header + 3 accounts
  })
})

describe('scheduled delivery', () => {
  it('claims a due schedule, generates + delivers, and advances next_run_at', async () => {
    const id = await createSchedule({ reportKey: 'account-inventory', format: 'csv', intervalSeconds: 3600, channel: 'notification', firstRunAt: past(), actor: 'admin' }, pool)
    const ran = await runDueReportSchedules(pool)
    expect(ran).toBeGreaterThanOrEqual(1)

    const run = (await pool.query('SELECT * FROM pam.report_runs WHERE schedule_id=$1', [id])).rows[0]
    expect(run).toBeTruthy()
    expect(run.delivery_status).toBe('delivered')
    expect(run.delivered).toBe(true)

    const sched = (await listSchedules(pool)).find((s) => s.id === id)!
    expect(new Date(sched.next_run_at).getTime()).toBeGreaterThan(Date.now())

    // A second immediate sweep is a no-op (already claimed / not yet due).
    expect(await runDueReportSchedules(pool)).toBe(0)
  })

  it('marks email/webhook delivery as EXTERNALLY CONSTRAINED (skipped), not delivered', async () => {
    const id = await createSchedule({ reportKey: 'rotation-status', format: 'pdf', intervalSeconds: 3600, channel: 'email', firstRunAt: past(), actor: 'admin' }, pool)
    await runDueReportSchedules(pool)
    const run = (await pool.query('SELECT delivered, delivery_status, delivery_detail FROM pam.report_runs WHERE schedule_id=$1', [id])).rows[0]
    expect(run.delivered).toBe(false)
    expect(run.delivery_status).toBe('skipped')
    expect(run.delivery_detail).toMatch(/external transport/)
  })
})
