import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { verifyAuditIntegrity, createCheckpoint } from '~~/layers/pam/server/utils/pamAudit'
import { getPamDb } from '~~/server/utils/moduleDb'
import { recordRisk } from '~~/layers/pam/server/utils/pamRisk'

/**
 * Run the audit-integrity verification job: recompute the hash chain and
 * re-verify every signed checkpoint. Optionally anchor a new checkpoint. A
 * failure raises a critical risk event. (pam.audit.view)
 */
export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.audit.view')
  const db = getPamDb()
  const body = await readBody(event).catch(() => ({}))
  if (body?.checkpoint) await createCheckpoint(user.username, db).catch(() => {})
  const report = await verifyAuditIntegrity(db)
  if (!report.ok) {
    await recordRisk({ ruleKey: 'audit_integrity_failure', actor: user.username, severity: 'critical',
      explanation: `Audit integrity check failed: brokenAt=${report.brokenAt ?? 'n/a'}, failedCheckpoints=${report.checkpointsFailed}.` }, db)
  }
  await pamAudit(event, user, { action: 'audit.verify', objectType: 'audit', severity: report.ok ? 'notice' : 'critical', result: report.ok ? 'success' : 'failure', details: report })
  return report
})
