import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePam, assertSafePermission, pamAudit, loadOr404, nowIso } from '~~/layers/pam/server/utils/pamStore'

const CRITICALITY = ['low', 'medium', 'high', 'critical']
const EDITABLE = ['name', 'description', 'business_owner', 'technical_owner', 'department', 'environment', 'data_classification', 'retention_days', 'require_dual_control', 'status']

/** Update safe metadata (requires manage_safe on the safe or admin tier). */
export default defineEventHandler(async (event) => {
  const { user, tier } = await requirePam(event, 'viewer')
  const id = getRouterParam(event, 'id')!
  await loadOr404('pam.safes', id, 'Safe not found')
  await assertSafePermission(user, tier, id, 'manage_safe')
  const body = await readBody(event)

  const sets: string[] = []
  const params: any[] = []
  let i = 1
  for (const key of EDITABLE) {
    if (body[key] === undefined) continue
    if (key === 'criticality' && !CRITICALITY.includes(body[key])) continue
    sets.push(`${key} = $${i++}`)
    params.push(body[key])
  }
  if (body.criticality !== undefined && CRITICALITY.includes(body.criticality)) { sets.push(`criticality = $${i++}`); params.push(body.criticality) }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No editable fields provided' })
  sets.push(`row_version = row_version + 1`, `updated_at = $${i++}`, `updated_by = $${i++}`)
  params.push(nowIso(), user.username, id)

  await getPamDb().query(`UPDATE pam.safes SET ${sets.join(', ')} WHERE id = $${i}`, params)
  await pamAudit(event, user, { action: 'safe.update', objectType: 'safe', objectId: id, safeId: id, severity: 'notice' })
  return { ok: true }
})
