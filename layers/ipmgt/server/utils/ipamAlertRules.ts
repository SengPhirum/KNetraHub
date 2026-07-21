import { getModuleSetting, setModuleSetting } from '~~/server/utils/moduleSettings'
import { renderTemplate } from '~~/server/utils/alertRules'

/**
 * IP Management alert rule configuration. Mirrors the Docker alert-rule model
 * (server/utils/alertRules.ts): defaults live in code, per-rule overrides stay
 * in the IPAM database (ipmgt_settings) so portal backups never contain
 * subsystem data. Delivery goes through the central notification library
 * (channelsForScope('ipmgt')) — see ipamAlertNotify.ts.
 */

export type IpamAlertRuleType =
  | 'subnet_utilization'
  | 'subnet_full'
  | 'ip_request_submitted'

export interface IpamAlertRuleDef {
  type: IpamAlertRuleType
  enabled: boolean
  config: Record<string, any>
  template: string
  placeholders: string[]
}

const RULES_KEY = 'alerts.rules'

export const DEFAULT_IPAM_RULES: Record<IpamAlertRuleType, IpamAlertRuleDef> = {
  // Polled: a subnet crosses a utilization threshold. The flagship IPAM alert —
  // running out of addresses is the classic "important" IPAM condition.
  subnet_utilization: {
    type: 'subnet_utilization',
    enabled: true,
    config: { percent: 90 },
    template: 'Subnet {{target}} is {{percent}}% full ({{used}}/{{capacity}} used, {{free}} free, threshold {{threshold}}%)',
    placeholders: ['target', 'percent', 'used', 'capacity', 'free', 'threshold', 'time']
  },
  // Polled: a subnet has no free addresses left. Critical — new allocations fail.
  subnet_full: {
    type: 'subnet_full',
    enabled: true,
    config: {},
    template: 'Subnet {{target}} is FULL — 0 addresses free ({{used}}/{{capacity}} used)',
    placeholders: ['target', 'used', 'capacity', 'time']
  },
  // Event: a new IP request was submitted and is waiting for a manager to review.
  ip_request_submitted: {
    type: 'ip_request_submitted',
    enabled: true,
    config: {},
    template: 'New IP request on subnet {{target}} by {{requester}}{{requested}} — {{description}}',
    placeholders: ['target', 'requester', 'requested', 'description', 'time']
  }
}

type RuleOverride = Partial<Pick<IpamAlertRuleDef, 'enabled' | 'config' | 'template'>>

async function readRuleOverrides(): Promise<Partial<Record<IpamAlertRuleType, RuleOverride>>> {
  const raw = await getModuleSetting('ipmgt', RULES_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function getIpamAlertRule(type: IpamAlertRuleType): Promise<IpamAlertRuleDef> {
  const overrides = await readRuleOverrides()
  const base = DEFAULT_IPAM_RULES[type]
  const override = overrides[type]
  if (!override) return base
  return {
    ...base,
    ...override,
    config: { ...base.config, ...(override.config || {}) }
  }
}

export async function getAllIpamAlertRules(): Promise<IpamAlertRuleDef[]> {
  return Promise.all((Object.keys(DEFAULT_IPAM_RULES) as IpamAlertRuleType[]).map(getIpamAlertRule))
}

export async function saveIpamAlertRule(type: IpamAlertRuleType, patch: RuleOverride, actor: string): Promise<IpamAlertRuleDef> {
  const overrides = await readRuleOverrides()
  const current = await getIpamAlertRule(type)
  const nextOverride: RuleOverride = {
    enabled: patch.enabled ?? current.enabled,
    config: { ...current.config, ...(patch.config || {}) },
    template: patch.template ?? current.template
  }
  overrides[type] = nextOverride
  await setModuleSetting('ipmgt', RULES_KEY, JSON.stringify(overrides), actor)
  return { ...DEFAULT_IPAM_RULES[type], ...nextOverride }
}

/** Reverts one rule type to its default — leaves the other rules' overrides untouched. */
export async function resetIpamAlertRule(type: IpamAlertRuleType, actor: string): Promise<IpamAlertRuleDef> {
  const overrides = await readRuleOverrides()
  delete overrides[type]
  await setModuleSetting('ipmgt', RULES_KEY, JSON.stringify(overrides), actor)
  return DEFAULT_IPAM_RULES[type]
}

export { renderTemplate }
