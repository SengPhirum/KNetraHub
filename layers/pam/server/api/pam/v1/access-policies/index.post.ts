import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { createPolicy } from '~~/layers/pam/server/utils/pamPolicyStore'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.policy.manage')
  const body = await readBody(event)
  if (!String(body?.name || '').trim()) throw createError({ statusCode: 400, statusMessage: 'name is required' })
  const id = await createPolicy({
    name: body.name, description: body.description, approvalType: body.approval_type,
    requireTicket: body.require_ticket, requireMfa: body.require_mfa, requireRecording: body.require_recording,
    allowSelfApproval: body.allow_self_approval, maxDurationMinutes: body.max_duration_minutes,
    maxConcurrentSessions: body.max_concurrent_sessions, maxUseCount: body.max_use_count,
    allowedProtocols: body.allowed_protocols, allowedSourceNetworks: body.allowed_source_networks,
    allowedHours: body.allowed_hours, separationOfDuties: body.separation_of_duties, enabled: body.enabled,
    levels: body.levels, actor: user.username
  })
  await pamAudit(event, user, { action: 'policy.create', objectType: 'access_policy', objectId: id, severity: 'notice', details: { name: body.name } })
  return { id }
})
