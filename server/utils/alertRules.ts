import { getModuleSetting, setModuleSetting } from './moduleSettings'

/**
 * Docker alert rule configuration. Defaults live in code and overrides stay
 * in the Docker database so portal-only backups never contain subsystem data.
 * All rule types share one settings row because the set is small and fixed.
 */

export type AlertRuleType =
  | 'deploy_failed'
  | 'usage_threshold'
  | 'node_down'
  | 'replicas_degraded'
  | 'disk_usage_threshold'
  | 'stack_deployed'
  | 'stack_removed'
  | 'service_down'
  | 'service_recovered'
  | 'service_redeployed'
  | 'service_scaled'
  | 'service_image_updated'
  | 'task_failed'
  | 'task_shutdown'

export interface AlertRuleDef {
  type: AlertRuleType
  enabled: boolean
  config: Record<string, any>
  template: string
  placeholders: string[]
}

const RULES_KEY = 'alerts.rules'

export const DEFAULT_RULES: Record<AlertRuleType, AlertRuleDef> = {
  deploy_failed: {
    type: 'deploy_failed',
    enabled: true,
    config: {},
    template: 'Deploy failed for {{target}}: {{error}}',
    placeholders: ['target', 'error', 'actor', 'time']
  },
  usage_threshold: {
    type: 'usage_threshold',
    enabled: true,
    config: { cpuPercent: 90, memoryPercent: 90, cpuEnabled: true, memoryEnabled: true },
    template: '{{target}} usage threshold exceeded: CPU {{cpuPercent}}% (limit {{cpuThreshold}}%), Memory {{memoryPercent}}% (limit {{memoryThreshold}}%)',
    placeholders: ['target', 'cpuPercent', 'memoryPercent', 'cpuThreshold', 'memoryThreshold', 'time']
  },
  node_down: {
    type: 'node_down',
    enabled: true,
    config: {},
    template: 'Node {{target}} stopped reporting (last seen {{lastSeen}})',
    placeholders: ['target', 'lastSeen', 'time']
  },
  replicas_degraded: {
    type: 'replicas_degraded',
    enabled: true,
    config: { gracePeriodMinutes: 2 },
    template: 'Service {{target}} degraded: {{running}}/{{desired}} replicas running for over {{gracePeriodMinutes}} minutes',
    placeholders: ['target', 'running', 'desired', 'gracePeriodMinutes', 'time']
  },
  disk_usage_threshold: {
    type: 'disk_usage_threshold',
    enabled: true,
    config: { percent: 85 },
    template: 'Node {{target}} disk usage at {{percent}}% (threshold {{threshold}}%)',
    placeholders: ['target', 'percent', 'threshold', 'time']
  },
  stack_deployed: {
    type: 'stack_deployed',
    enabled: true,
    config: {},
    template: 'Stack {{target}} {{action}} by {{actor}}: {{created}} created, {{updated}} updated',
    placeholders: ['target', 'action', 'actor', 'created', 'updated', 'time']
  },
  stack_removed: {
    type: 'stack_removed',
    enabled: true,
    config: {},
    template: 'Stack {{target}} removed by {{actor}} ({{services}} services stopped)',
    placeholders: ['target', 'actor', 'services', 'time']
  },
  service_down: {
    type: 'service_down',
    enabled: true,
    config: { gracePeriodMinutes: 2 },
    template: 'Service {{target}} is DOWN: 0/{{desired}} replicas running for over {{gracePeriodMinutes}} minutes',
    placeholders: ['target', 'desired', 'gracePeriodMinutes', 'time']
  },
  service_recovered: {
    type: 'service_recovered',
    enabled: true,
    config: {},
    template: 'Service {{target}} recovered: {{running}}/{{desired}} replicas running',
    placeholders: ['target', 'running', 'desired', 'time']
  },
  service_redeployed: {
    type: 'service_redeployed',
    enabled: true,
    config: {},
    template: 'Service {{target}} redeployed ({{trigger}}) by {{actor}}',
    placeholders: ['target', 'trigger', 'actor', 'time']
  },
  service_scaled: {
    type: 'service_scaled',
    enabled: true,
    config: {},
    template: 'Service {{target}} scaled from {{from}} to {{to}} replicas by {{actor}}',
    placeholders: ['target', 'from', 'to', 'actor', 'time']
  },
  service_image_updated: {
    type: 'service_image_updated',
    enabled: true,
    config: {},
    template: 'Service {{target}} image updated to {{image}} by {{actor}} (was {{previousImage}})',
    placeholders: ['target', 'image', 'previousImage', 'actor', 'time']
  },
  task_failed: {
    type: 'task_failed',
    enabled: true,
    config: {},
    template: 'Task of service {{target}} {{state}} on node {{node}}: {{error}}',
    placeholders: ['target', 'taskId', 'state', 'node', 'error', 'time']
  },
  // Every redeploy/scale-down legitimately shuts tasks down, so this one is
  // noisy by design - off by default, opt-in from Dock -> Settings -> Alerts.
  task_shutdown: {
    type: 'task_shutdown',
    enabled: false,
    config: {},
    template: 'Task of service {{target}} shut down on node {{node}}{{message}}',
    placeholders: ['target', 'taskId', 'node', 'message', 'time']
  }
}

/** Replaces {{key}} tokens; unmatched placeholders are left as-is. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match)
}

type RuleOverride = Partial<Pick<AlertRuleDef, 'enabled' | 'config' | 'template'>>

async function readRuleOverrides(): Promise<Partial<Record<AlertRuleType, RuleOverride>>> {
  const raw = await getModuleSetting('docker', RULES_KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function getAlertRule(type: AlertRuleType): Promise<AlertRuleDef> {
  const overrides = await readRuleOverrides()
  const base = DEFAULT_RULES[type]
  const override = overrides[type]
  if (!override) return base
  return {
    ...base,
    ...override,
    config: { ...base.config, ...(override.config || {}) }
  }
}

export async function getAllAlertRules(): Promise<AlertRuleDef[]> {
  return Promise.all((Object.keys(DEFAULT_RULES) as AlertRuleType[]).map(getAlertRule))
}

export async function saveAlertRule(type: AlertRuleType, patch: RuleOverride, actor: string): Promise<AlertRuleDef> {
  const overrides = await readRuleOverrides()
  const current = await getAlertRule(type)
  const nextOverride: RuleOverride = {
    enabled: patch.enabled ?? current.enabled,
    config: { ...current.config, ...(patch.config || {}) },
    template: patch.template ?? current.template
  }
  overrides[type] = nextOverride
  await setModuleSetting('docker', RULES_KEY, JSON.stringify(overrides), actor)
  return { ...DEFAULT_RULES[type], ...nextOverride }
}

/** Reverts one rule type to its default - leaves the other rules' overrides untouched. */
export async function resetAlertRule(type: AlertRuleType, actor: string): Promise<AlertRuleDef> {
  const overrides = await readRuleOverrides()
  delete overrides[type]
  await setModuleSetting('docker', RULES_KEY, JSON.stringify(overrides), actor)
  return DEFAULT_RULES[type]
}
