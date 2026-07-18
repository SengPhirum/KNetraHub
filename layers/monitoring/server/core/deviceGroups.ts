import type { Pool } from 'pg'
import { evaluateConditions } from '../alerting/conditions'

/**
 * Dynamic device-group membership: groups with a `rules` tree get their
 * members recomputed from device rows (same condition grammar as alert
 * rules). Static members (dynamic=false) are never touched here.
 */
export async function refreshGroupMembership(db: Pool, groupId: number): Promise<number> {
  const g = await db.query(`SELECT id, rules FROM monitoring.device_groups WHERE id = $1`, [groupId])
  if (!g.rows.length || !g.rows[0].rules) return 0
  const devices = await db.query(`SELECT * FROM monitoring.devices`)
  const matching = devices.rows.filter((d: any) => {
    try {
      return evaluateConditions(g.rows[0].rules, d)
    } catch {
      return false
    }
  })
  await db.query(`DELETE FROM monitoring.device_group_members WHERE group_id = $1 AND dynamic`, [groupId])
  for (const device of matching) {
    await db.query(
      `INSERT INTO monitoring.device_group_members (group_id, device_id, dynamic) VALUES ($1,$2,true)
       ON CONFLICT DO NOTHING`,
      [groupId, device.id]
    )
  }
  return matching.length
}

/** Refresh every dynamic group (housekeeping). */
export async function refreshAllGroupMemberships(db: Pool): Promise<void> {
  const groups = await db.query(`SELECT id FROM monitoring.device_groups WHERE rules IS NOT NULL`)
  for (const group of groups.rows) {
    await refreshGroupMembership(db, Number(group.id))
  }
}
