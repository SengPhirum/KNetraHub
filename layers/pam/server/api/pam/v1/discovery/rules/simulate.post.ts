import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { simulateRules } from '~~/layers/pam/server/utils/pamDiscovery'

/** Dry-run the onboarding rule set against a sample discovered account. */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.discovery.view')
  const body = await readBody(event)
  const sample = (body?.account && typeof body.account === 'object') ? body.account : body || {}
  return simulateRules(sample)
})
