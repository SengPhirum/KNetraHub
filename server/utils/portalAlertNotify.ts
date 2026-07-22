import { getPortalAlertRule, renderTemplate, type PortalAlertRuleType } from './portalAlertRules'
import { channelsForScope } from './notifyStore'
import { deliverToChannel } from './notify'
import { recordNotification } from './notificationFeed'
import { logSystem } from './moduleLogs'
import { NOTIFICATION_SCOPE_GLOBAL } from '../../shared/utils/notifications'

/**
 * Fire an admin-portal alert. The portal's own channels are the Global channels
 * an admin configured under Admin > Notifications > Channels, so delivery uses
 * the global scope (sub-apps opt into those same channels; the portal owns
 * them). Never throws — these fire from auth/user/backup paths that must not
 * break because a notification failed.
 */

export interface FirePortalAlertInput {
  ruleType: PortalAlertRuleType
  target?: string
  severity: 'critical' | 'warning' | 'info'
  vars: Record<string, string>
}

export async function firePortalAlert(input: FirePortalAlertInput): Promise<void> {
  try {
    const rule = await getPortalAlertRule(input.ruleType)
    if (!rule.enabled) return

    const message = renderTemplate(rule.template, { ...input.vars, target: input.target ?? input.vars.target ?? '' })

    const enabled = await channelsForScope(NOTIFICATION_SCOPE_GLOBAL).catch(() => [])
    const notifyMsg = {
      title: `[${input.severity.toUpperCase()}] ${input.ruleType.replace(/_/g, ' ')}${input.target ? ` — ${input.target}` : ''}`,
      body: message,
      severity: input.severity,
      kind: 'alert' as const
    }

    // Central in-portal feed (navbar bell) — independent of external delivery,
    // so the alert is visible in-app even with no channels configured.
    await recordNotification({
      app: 'portal',
      severity: input.severity,
      title: `${input.ruleType.replace(/_/g, ' ')}${input.target ? ` — ${input.target}` : ''}`,
      body: message,
      ruleType: input.ruleType,
      target: input.target ?? null
    })
    let delivered = 0
    for (const channel of enabled) {
      const res = await deliverToChannel(channel, notifyMsg)
      if (res.ok) delivered++
      else await logSystem('portal', 'error', 'alert.notify.failed',
        `Channel "${channel.name}" (${channel.type}) failed for ${input.ruleType}: ${res.error}`)
    }
    await logSystem('portal', 'info', 'alert.fired',
      `${input.severity.toUpperCase()} ${input.ruleType}${input.target ? ` "${input.target}"` : ''} - notified ${delivered}/${enabled.length} channel(s)`)
  } catch (err: any) {
    await logSystem('portal', 'error', 'alert.fire.failed', `firePortalAlert(${input.ruleType}) failed: ${err?.message || err}`)
  }
}

// ── Failed-sign-in burst tracking ────────────────────────────────────────────
// Consecutive failures per username, cleared on a successful sign-in. Kept in
// memory on purpose: this is a burst signal, not an audit record (the audit log
// and system log already persist every attempt).
const failedLogins = new Map<string, number>()

/** Record a failed sign-in; fires login_failed once the threshold is reached. */
export async function noteFailedLogin(username: string): Promise<void> {
  try {
    const rule = await getPortalAlertRule('login_failed')
    if (!rule.enabled) return
    const threshold = Math.max(1, Number(rule.config.threshold) || 5)
    const attempts = (failedLogins.get(username) || 0) + 1
    failedLogins.set(username, attempts)
    // Fire once per burst — not on every failure past the threshold.
    if (attempts !== threshold) return
    await firePortalAlert({
      ruleType: 'login_failed',
      target: username,
      severity: 'warning',
      vars: { target: username, attempts: String(attempts), threshold: String(threshold), time: new Date().toISOString() }
    })
  } catch { /* never break the auth path */ }
}

/** Clear a username's failure streak after a successful sign-in. */
export function clearFailedLogins(username: string): void {
  failedLogins.delete(username)
}
