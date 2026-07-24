import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { loadRules } from '~~/layers/pam/server/utils/pamDiscovery'
import { getPamDb } from '~~/server/utils/moduleDb'
import { ruleConflicts } from '~~/layers/pam/server/utils/pamDiscoveryCore'

export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.discovery.view')
  const rules = await loadRules(getPamDb())
  return { rules, conflicts: ruleConflicts(rules.map((r) => ({ id: r.id, priority: r.priority, enabled: r.enabled, conditions: r.conditions, action: r.action }))) }
})
