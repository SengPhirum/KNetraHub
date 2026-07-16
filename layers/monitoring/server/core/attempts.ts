import type { Pool } from 'pg'
import type { CollectionOutcome } from '../../shared/constants'

/**
 * Buffered writer for the per-item collection-outcome trail
 * (monitoring.collection_attempts). Batched to one multi-row INSERT per
 * flush so a 1000-item poll doesn't cost 1000 round-trips.
 */
export interface AttemptRow {
  runId: number | null
  deviceId: number | null
  module: string
  item: string
  outcome: CollectionOutcome
  detail?: string
  durationMs?: number
}

export class AttemptBuffer {
  private rows: AttemptRow[] = []
  readonly counts: Record<string, number> = {}

  constructor(private db: Pool, private runId: number | null, private deviceId: number | null) {}

  record(module: string, item: string, outcome: CollectionOutcome, detail?: string, durationMs?: number): void {
    this.rows.push({ runId: this.runId, deviceId: this.deviceId, module, item, outcome, detail, durationMs })
    this.counts[outcome] = (this.counts[outcome] ?? 0) + 1
  }

  /** Bind a module name so engine modules only supply (item, outcome, …). */
  recorderFor(module: string) {
    return (item: string, outcome: CollectionOutcome, detail?: string, durationMs?: number) =>
      this.record(module, item, outcome, detail, durationMs)
  }

  get planned(): number {
    return this.rows.length
  }

  async flush(): Promise<void> {
    if (!this.rows.length) return
    const rows = this.rows.splice(0, this.rows.length)
    const params: unknown[] = []
    const values = rows.map((r, i) => {
      const b = i * 7
      params.push(r.runId, r.deviceId, r.module, r.item, r.outcome, r.detail ?? null, r.durationMs ?? null)
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`
    })
    try {
      await this.db.query(
        `INSERT INTO monitoring.collection_attempts (run_id, device_id, module, item, outcome, detail, duration_ms)
         VALUES ${values.join(',')}`,
        params
      )
    } catch (err) {
      console.error('[monitoring:attempts] failed to persist collection attempts', err)
    }
  }

  /** Outcome roll-up for poll_runs/module_runs counters. */
  summary() {
    const c = this.counts
    const failed = (c.timeout ?? 0) + (c.auth_failure ?? 0) + (c.parse_error ?? 0) + (c.db_error ?? 0) + (c.failed ?? 0)
    return {
      planned: Object.values(c).reduce((a, b) => a + b, 0),
      succeeded: c.success ?? 0,
      empty: c.empty ?? 0,
      unsupported: c.unsupported ?? 0,
      skipped: c.skipped ?? 0,
      failed
    }
  }
}
