import type { Pool } from 'pg'
import { getPamDb } from '~~/server/utils/moduleDb'
import { recordRisk } from './pamRisk'

/**
 * Zero-standing-privilege scan (spec §9). Detects privileges that persist
 * outside a JIT window — the things ZSP policy aims to eliminate — and records
 * a risk event per finding so they surface for remediation (which is the JIT
 * request/revoke workflow, not just an alert).
 */
export interface ZspFinding { kind: string; subject: string; detail: string; severity: 'low' | 'medium' | 'high' | 'critical'; accountId?: string | null }

export async function scanZsp(db: Pool = getPamDb(), opts: { record?: boolean } = {}): Promise<{ findings: ZspFinding[]; scanned: number }> {
  const findings: ZspFinding[] = []

  // 1. Privileged accounts that are NOT just-in-time / not auto-managed / never rotate.
  const priv = await db.query(
    `SELECT id, name, username, criticality, privilege_level, auto_managed, next_rotation_at
       FROM pam.accounts
      WHERE deleted_at IS NULL
        AND (criticality IN ('high','critical') OR lower(coalesce(privilege_level,'')) IN ('root','admin','administrator','superuser'))
        AND (auto_managed = false OR next_rotation_at IS NULL)`
  )
  for (const a of priv.rows) {
    findings.push({ kind: 'standing_privileged_account', subject: a.name, accountId: a.id, severity: a.criticality === 'critical' ? 'critical' : 'high',
      detail: `Privileged account "${a.username}" is standing (auto_managed=${a.auto_managed}, next_rotation=${a.next_rotation_at || 'none'}) — convert to JIT / enable rotation.` })
  }

  // 2. Permanent membership of a privileged group (discovered, onboarded, no JIT).
  const grp = await db.query(
    `SELECT d.id, d.username, d.privileged_group, d.address
       FROM pam.discovered_accounts d
      WHERE d.privileged_group IS NOT NULL AND d.privileged_group NOT IN ('', 'false')
        AND d.status = 'onboarded'
        AND NOT EXISTS (SELECT 1 FROM pam.jit_entitlements j WHERE lower(j.principal)=lower(d.username) AND j.state IN ('active','requested','approved','provisioning'))`
  )
  for (const d of grp.rows) {
    findings.push({ kind: 'standing_group_membership', subject: `${d.username}@${d.address || ''}`, severity: 'medium',
      detail: `Permanent membership of privileged group "${d.privileged_group}" without a JIT entitlement.` })
  }

  // 3. Never-expiring directory accounts flagged during discovery.
  const nonExp = await db.query("SELECT id, username, address FROM pam.discovered_accounts WHERE non_expiring = true AND status IN ('pending','onboarded')")
  for (const d of nonExp.rows) {
    findings.push({ kind: 'non_expiring_account', subject: `${d.username}@${d.address || ''}`, severity: 'medium', detail: 'Account is set to never expire its password.' })
  }

  if (opts.record !== false) {
    for (const f of findings) {
      await recordRisk({ ruleKey: 'standing_privilege', accountId: f.accountId ?? undefined, target: f.subject, severity: f.severity, explanation: `${f.kind}: ${f.detail}` }, db).catch(() => {})
    }
  }
  return { findings, scanned: priv.rowCount! + grp.rowCount! + nonExp.rowCount! }
}
