import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { scanZsp } from '~~/layers/pam/server/utils/pamZsp'

/** Run a zero-standing-privilege scan; records a risk event per finding. */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.audit.view')
  const result = await scanZsp()
  await pamAudit(event, user, { action: 'zsp.scan', objectType: 'zsp', severity: result.findings.length ? 'warning' : 'notice', details: { findings: result.findings.length, scanned: result.scanned } })
  return result
})
