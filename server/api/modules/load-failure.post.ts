import { requireUser } from '~~/server/utils/auth'
import { audit } from '~~/server/utils/store'
import { firePortalAlert } from '~~/server/utils/portalAlertNotify'

/**
 * Fire-and-forget endpoint RemoteModuleLoader calls when a remote subsystem
 * UI fails to load, so outages are visible in the existing Audit log rather
 * than only in the browser console.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{ moduleKey?: string; remoteName?: string; remoteEntryUrl?: string; error?: string }>(event)
  const target = body.moduleKey || body.remoteName || 'unknown'
  await audit({
    actor: user.username,
    action: 'module.load_failed',
    target,
    detail: `${body.remoteName || ''} ${body.remoteEntryUrl || ''} - ${body.error || ''}`.trim()
  })

  void firePortalAlert({
    ruleType: 'module_load_failed',
    target,
    severity: 'critical',
    vars: { target, error: body.error || 'unknown error', actor: user.username, time: new Date().toISOString() }
  })
  return { ok: true }
})
