import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

/** List access (approval) policies with their level rules (pam.policy.view). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.policy.view')
  const db = getPamDb()
  const { rows } = await db.query('SELECT * FROM pam.access_policies ORDER BY name')
  const rules = await db.query('SELECT * FROM pam.access_policy_rules ORDER BY policy_id, level, ordering')
  const byPolicy = new Map<string, any[]>()
  for (const r of rules.rows) { if (!byPolicy.has(r.policy_id)) byPolicy.set(r.policy_id, []); byPolicy.get(r.policy_id)!.push(r) }
  return rows.map((p) => ({ ...p, rules: byPolicy.get(p.id) || [] }))
})
