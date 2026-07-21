import { getIpamAlertRule, renderTemplate, type IpamAlertRuleType } from './ipamAlertRules'
import { channelsForScope } from '~~/server/utils/notifyStore'
import { deliverToChannel } from '~~/server/utils/notify'
import { logSystem } from '~~/server/utils/moduleLogs'

/**
 * Fire an IP Management alert. Looks up the rule (no-op if disabled), renders
 * its template, then delivers through the central notification library to every
 * enabled channel the IPAM app uses — its own ipmgt-scoped channels plus the
 * Global channels it opted into (channelsForScope('ipmgt')). Never throws: the
 * event-fired callers (e.g. request submission) must not be broken by a
 * notification failure.
 */

export interface FireIpamAlertInput {
  ruleType: IpamAlertRuleType
  target?: string
  severity: 'critical' | 'warning' | 'info'
  vars: Record<string, string>
}

export async function fireIpamAlert(input: FireIpamAlertInput): Promise<void> {
  try {
    const rule = await getIpamAlertRule(input.ruleType)
    if (!rule.enabled) return

    const message = renderTemplate(rule.template, { ...input.vars, target: input.target ?? input.vars.target ?? '' })

    const enabled = await channelsForScope('ipmgt').catch(() => [])
    const notifyMsg = {
      title: `[${input.severity.toUpperCase()}] ${input.ruleType.replace(/_/g, ' ')}${input.target ? ` — ${input.target}` : ''}`,
      body: message,
      severity: input.severity,
      kind: 'alert' as const
    }
    let delivered = 0
    for (const channel of enabled) {
      const res = await deliverToChannel(channel, notifyMsg)
      if (res.ok) delivered++
      else await logSystem('ipmgt', 'error', 'alert.notify.failed',
        `Channel "${channel.name}" (${channel.type}) failed for ${input.ruleType}: ${res.error}`)
    }
    await logSystem('ipmgt', 'info', 'alert.fired',
      `${input.severity.toUpperCase()} ${input.ruleType}${input.target ? ` "${input.target}"` : ''} - notified ${delivered}/${enabled.length} channel(s)`)
  } catch (err: any) {
    await logSystem('ipmgt', 'error', 'alert.fire.failed', `fireIpamAlert(${input.ruleType}) failed: ${err?.message || err}`)
  }
}
