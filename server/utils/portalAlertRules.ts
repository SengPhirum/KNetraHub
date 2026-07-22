import { getAppSetting, setAppSetting } from './store'
import { renderTemplate } from './alertTemplate'

/**
 * Portal alert rule configuration — the admin portal's own alert engine, the
 * peer of the per-app engines in layers/docker, layers/monitoring and
 * layers/ipmgt. Covers portal-level security and system events (sign-ins,
 * privilege changes, backup/module failures) rather than any one sub-app.
 *
 * Defaults live in code; overrides stay in the portal database (app_settings).
 * Delivery goes to the portal's own channels — the Global channels an admin
 * configured under Admin > Notifications > Channels (see portalAlertNotify.ts).
 */

export type PortalAlertRuleType =
  | 'login_failed'
  | 'admin_login'
  | 'user_role_changed'
  | 'user_deleted'
  | 'module_load_failed'
  | 'backup_failed'

export interface PortalAlertRuleDef {
  type: PortalAlertRuleType
  enabled: boolean
  config: Record<string, any>
  template: string
  placeholders: string[]
}

const RULES_KEY = 'portal.alerts.rules'

export const DEFAULT_PORTAL_RULES: Record<PortalAlertRuleType, PortalAlertRuleDef> = {
  // Brute-force signal: fires once a username reaches N consecutive failures,
  // then stays quiet until that account signs in successfully again.
  login_failed: {
    type: 'login_failed',
    enabled: true,
    config: { threshold: 5 },
    template: 'Repeated failed sign-in attempts for "{{target}}" — {{attempts}} consecutive failures (threshold {{threshold}})',
    placeholders: ['target', 'attempts', 'threshold', 'time']
  },
  // Visibility on privileged sign-ins. Off by default: on a busy portal an
  // admin signing in is routine, and this would be noisy.
  admin_login: {
    type: 'admin_login',
    enabled: false,
    config: {},
    template: 'Portal admin {{target}} signed in via {{source}}',
    placeholders: ['target', 'source', 'time']
  },
  // Privilege change is the classic thing you want to know about immediately.
  user_role_changed: {
    type: 'user_role_changed',
    enabled: true,
    config: {},
    template: 'Portal role for {{target}} changed from {{from}} to {{to}} by {{actor}}',
    placeholders: ['target', 'from', 'to', 'actor', 'time']
  },
  user_deleted: {
    type: 'user_deleted',
    enabled: true,
    config: {},
    template: 'Portal user {{target}} was deleted by {{actor}}',
    placeholders: ['target', 'actor', 'time']
  },
  module_load_failed: {
    type: 'module_load_failed',
    enabled: true,
    config: {},
    template: 'Subsystem UI failed to load: {{target}} — {{error}}',
    placeholders: ['target', 'error', 'actor', 'time']
  },
  backup_failed: {
    type: 'backup_failed',
    enabled: true,
    config: {},
    template: 'Backup {{operation}} FAILED for {{target}}{{filename}} — {{error}}',
    placeholders: ['target', 'operation', 'filename', 'error', 'actor', 'time']
  }
}

type RuleOverride = Partial<Pick<PortalAlertRuleDef, 'enabled' | 'config' | 'template'>>

async function readRuleOverrides(): Promise<Partial<Record<PortalAlertRuleType, RuleOverride>>> {
  const raw = await getAppSetting(RULES_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function getPortalAlertRule(type: PortalAlertRuleType): Promise<PortalAlertRuleDef> {
  const overrides = await readRuleOverrides()
  const base = DEFAULT_PORTAL_RULES[type]
  const override = overrides[type]
  if (!override) return base
  return {
    ...base,
    ...override,
    config: { ...base.config, ...(override.config || {}) }
  }
}

export async function getAllPortalAlertRules(): Promise<PortalAlertRuleDef[]> {
  return Promise.all((Object.keys(DEFAULT_PORTAL_RULES) as PortalAlertRuleType[]).map(getPortalAlertRule))
}

export async function savePortalAlertRule(type: PortalAlertRuleType, patch: RuleOverride, actor: string): Promise<PortalAlertRuleDef> {
  const overrides = await readRuleOverrides()
  const current = await getPortalAlertRule(type)
  const nextOverride: RuleOverride = {
    enabled: patch.enabled ?? current.enabled,
    config: { ...current.config, ...(patch.config || {}) },
    template: patch.template ?? current.template
  }
  overrides[type] = nextOverride
  await setAppSetting(RULES_KEY, JSON.stringify(overrides), actor)
  return { ...DEFAULT_PORTAL_RULES[type], ...nextOverride }
}

/** Reverts one rule type to its default — leaves the other rules' overrides untouched. */
export async function resetPortalAlertRule(type: PortalAlertRuleType, actor: string): Promise<PortalAlertRuleDef> {
  const overrides = await readRuleOverrides()
  delete overrides[type]
  await setAppSetting(RULES_KEY, JSON.stringify(overrides), actor)
  return DEFAULT_PORTAL_RULES[type]
}

export { renderTemplate }
