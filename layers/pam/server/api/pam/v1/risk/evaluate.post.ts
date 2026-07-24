import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { evaluateRiskRules } from '~~/layers/pam/server/utils/pamRiskEngine'

/** Manually run the risk evaluation engine now (also runs on the maintenance sweep). */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.risk.manage')
  const body = await readBody(event).catch(() => ({}))
  const lookbackMinutes = Number(body?.lookback_minutes) || undefined
  return evaluateRiskRules(undefined, { lookbackMinutes })
})
