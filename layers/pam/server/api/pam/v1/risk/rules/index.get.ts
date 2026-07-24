import { requirePamPermission, getPam } from '~~/layers/pam/server/utils/pamStore'
import { parseAutoResponse, parseConfig } from '~~/layers/pam/server/utils/pamRiskEngineCore'

/** List risk rules with their enabled flag, severity, config and auto-responses. */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.audit.view')
  const { rows } = await getPam().query('SELECT rule_key, name, description, severity, enabled, config, auto_response, updated_at FROM pam.risk_rules ORDER BY rule_key')
  return rows.map((r) => ({
    ruleKey: r.rule_key, name: r.name, description: r.description, severity: r.severity,
    enabled: r.enabled !== false, config: parseConfig(r.config), autoResponse: parseAutoResponse(r.auto_response, [])
  }))
})
