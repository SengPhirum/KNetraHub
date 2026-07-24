import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { updatePolicy } from '~~/layers/pam/server/utils/pamPolicyStore'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.policy.manage')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  await updatePolicy(id, {
    name: body?.name, description: body?.description, approvalType: body?.approval_type,
    requireTicket: body?.require_ticket, requireMfa: body?.require_mfa, requireRecording: body?.require_recording,
    allowSelfApproval: body?.allow_self_approval, maxDurationMinutes: body?.max_duration_minutes,
    maxConcurrentSessions: body?.max_concurrent_sessions, maxUseCount: body?.max_use_count,
    allowedProtocols: body?.allowed_protocols, allowedSourceNetworks: body?.allowed_source_networks,
    allowedHours: body?.allowed_hours, separationOfDuties: body?.separation_of_duties, enabled: body?.enabled,
    levels: body?.levels, actor: user.username
  })
  await pamAudit(event, user, { action: 'policy.update', objectType: 'access_policy', objectId: id, severity: 'notice' })
  return { ok: true }
})
