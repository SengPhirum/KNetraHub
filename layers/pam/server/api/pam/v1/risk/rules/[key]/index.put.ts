import { requirePamPermission, getPam, nowIso } from '~~/layers/pam/server/utils/pamStore'
import { appendAudit } from '~~/layers/pam/server/utils/pamAudit'

const SEVERITIES = ['low', 'medium', 'high', 'critical']
const ACTIONS = ['alert', 'block_session', 'disable_account', 'suspend_vendor', 'open_investigation']

/** Update a risk rule's enabled flag, severity, config thresholds and auto-responses. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.risk.manage')
  const key = getRouterParam(event, 'key')!
  const body = await readBody(event)
  const db = getPam()
  const existing = (await db.query('SELECT rule_key FROM pam.risk_rules WHERE rule_key=$1', [key])).rows[0]
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Unknown risk rule' })

  const sets: string[] = []; const params: any[] = [key]
  if (body?.enabled !== undefined) { params.push(body.enabled === true); sets.push(`enabled=$${params.length}`) }
  if (body?.severity !== undefined) {
    if (!SEVERITIES.includes(String(body.severity))) throw createError({ statusCode: 400, statusMessage: 'invalid severity' })
    params.push(String(body.severity)); sets.push(`severity=$${params.length}`)
  }
  if (body?.config !== undefined) { params.push(JSON.stringify(body.config ?? {})); sets.push(`config=$${params.length}`) }
  if (body?.auto_response !== undefined) {
    const actions = Array.isArray(body.auto_response) ? body.auto_response.map(String) : []
    const bad = actions.filter((a: string) => !ACTIONS.includes(a))
    if (bad.length) throw createError({ statusCode: 400, statusMessage: `unknown auto-response(s): ${bad.join(', ')}` })
    params.push(JSON.stringify(actions)); sets.push(`auto_response=$${params.length}`)
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'no changes supplied' })
  params.push(nowIso()); sets.push(`updated_at=$${params.length}`)
  await db.query(`UPDATE pam.risk_rules SET ${sets.join(', ')} WHERE rule_key=$1`, params)
  await appendAudit({ actor: user.username, action: 'risk.rule.update', objectType: 'risk_rule', objectId: key, result: 'success', severity: 'notice' }).catch(() => {})
  return { ok: true }
})
