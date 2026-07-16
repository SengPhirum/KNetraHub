/**
 * Safe alert templates: {{ path.to.value }} interpolation over a fixed
 * context object. No code execution of any kind — unknown paths render as
 * empty strings, and output length is bounded.
 */

export interface TemplateContext {
  alert: Record<string, unknown>
  rule: Record<string, unknown>
  device: Record<string, unknown>
  faulting: Record<string, unknown>
  now: string
  portal_url: string
}

const MAX_OUTPUT = 8000

export function renderTemplate(template: string, ctx: TemplateContext): string {
  const out = template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) => {
    const value = lookupPath(ctx as unknown as Record<string, unknown>, path)
    return value == null ? '' : String(value)
  })
  return out.length > MAX_OUTPUT ? out.slice(0, MAX_OUTPUT) + '…' : out
}

function lookupPath(obj: Record<string, unknown>, path: string): unknown {
  let current: unknown = obj
  for (const part of path.split('.')) {
    if (current == null || typeof current !== 'object') return null
    if (/community|password|secret|token/.test(part)) return null
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'object' ? null : current
}

export const DEFAULT_TITLE_TEMPLATE = '[{{rule.severity}}] {{rule.name}} — {{device.hostname}}'

export const DEFAULT_BODY_TEMPLATE = [
  'Rule: {{rule.name}}',
  'Severity: {{rule.severity}}',
  'Device: {{device.hostname}} ({{device.ip}})',
  'OS: {{device.os}} {{device.os_version}}',
  'Location: {{device.location}}',
  'Status: {{device.status}}',
  'Uptime: {{device.uptime_seconds}}s',
  'Entity: {{alert.entity_type}} #{{alert.entity_id}}',
  'Opened: {{alert.opened_at}}',
  'State: {{alert.state}}',
  '',
  'Faulting values: {{faulting.summary}}',
  '',
  '{{portal_url}}/monitoring/devices/{{device.id}}'
].join('\n')
