import { getPamDb } from '~~/server/utils/moduleDb'
import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'

/**
 * Server-rendered PAM reports (pam.report.view). Each report is a labelled
 * column set + rows; the client renders/exports them (CSV/XLSX/JSON). Table and
 * column names are fixed literals — never derived from request input.
 */
const REPORTS: Record<string, { title: string; sql: string }> = {
  'account-inventory': {
    title: 'Privileged account inventory',
    sql: `SELECT a.name, a.username, a.address, s.name AS safe, p.name AS platform, a.account_type, a.criticality, a.rotation_status, a.last_used
            FROM pam.accounts a LEFT JOIN pam.safes s ON s.id=a.safe_id LEFT JOIN pam.platforms p ON p.id=a.platform_id
           WHERE a.deleted_at IS NULL ORDER BY s.name, a.name`
  },
  'unmanaged-accounts': {
    title: 'Unmanaged accounts',
    sql: `SELECT a.name, a.username, a.address, s.name AS safe, a.account_type FROM pam.accounts a LEFT JOIN pam.safes s ON s.id=a.safe_id WHERE a.deleted_at IS NULL AND a.rotation_status='unmanaged' ORDER BY a.name`
  },
  'rotation-status': {
    title: 'Rotation status',
    sql: `SELECT a.name, a.username, a.rotation_status, a.last_changed, a.next_rotation_at, a.auto_managed FROM pam.accounts a WHERE a.deleted_at IS NULL ORDER BY a.next_rotation_at NULLS LAST`
  },
  'credential-reveals': {
    title: 'Credential reveals',
    sql: `SELECT ts, actor, object_id AS account_id, reason, source_ip FROM pam.audit_events WHERE action='account.reveal' ORDER BY seq DESC LIMIT 1000`
  },
  'sessions': {
    title: 'Session history',
    sql: `SELECT started_at, ended_at, principal, target, protocol, state, recording_status, termination_reason FROM pam.sessions ORDER BY started_at DESC LIMIT 1000`
  },
  'approvals': {
    title: 'Approval history',
    sql: `SELECT r.created_at, r.requester, r.action, r.status, r.decision_reason FROM pam.access_requests r ORDER BY r.created_at DESC LIMIT 1000`
  },
  'break-glass': {
    title: 'Break-glass activity',
    sql: `SELECT g.created_at, g.grantee, a.name AS account, g.starts_at, g.expires_at, g.status FROM pam.access_grants g LEFT JOIN pam.accounts a ON a.id=g.account_id WHERE g.emergency=true ORDER BY g.created_at DESC LIMIT 1000`
  },
  'dormant-accounts': {
    title: 'Dormant accounts',
    sql: `SELECT a.name, a.username, a.last_used, s.name AS safe FROM pam.accounts a LEFT JOIN pam.safes s ON s.id=a.safe_id WHERE a.deleted_at IS NULL AND (a.last_used IS NULL OR a.last_used < now()::text) ORDER BY a.last_used NULLS FIRST LIMIT 1000`
  },
  'risk-findings': {
    title: 'Risk findings',
    sql: `SELECT created_at, rule_key, severity, actor, target, status, explanation FROM pam.risk_events ORDER BY created_at DESC LIMIT 1000`
  }
}

export const PAM_REPORTS = Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title }))

export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.report.view')
  const key = getRouterParam(event, 'key')!
  const report = REPORTS[key]
  if (!report) throw createError({ statusCode: 404, statusMessage: 'Unknown report' })
  const { rows } = await getPamDb().query(report.sql)
  const columns = rows.length ? Object.keys(rows[0]) : []
  return { key, title: report.title, columns, rows, generatedAt: new Date().toISOString() }
})
