import ExcelJS from 'exceljs'
import { requireRole } from '~~/server/utils/auth'
import { listUsers, audit } from '~~/server/utils/store'
import { getAppRoleMap } from '~~/server/utils/appRoles'
import { resolveEntitlements, APP_KEYS, type AppTier } from '../../../../shared/utils/entitlements'
import { cumulativeAppPermissions } from '../../../../shared/utils/permissions'

const TIERS: AppTier[] = ['viewer', 'operator', 'manager', 'admin']
const APP_LABELS: Record<string, string> = { docker: 'Docker', monitoring: 'Monitoring', ipmgt: 'IP Management' }

// Manager+ only, mirrors user-authority.get.ts's resolution logic but renders
// it as a downloadable workbook for offline audit review (three sheets: the
// per-user resolved access snapshot, the static tier->permission reference,
// and the realm-role->tier mapping currently configured in App & Access).
// The export itself is audited - who pulled a full access report, and when,
// is exactly the kind of thing a banking audit expects to be able to answer.
export default defineEventHandler(async (event) => {
  const actor = await requireRole(event, 'manager')

  const [users, roleMap] = await Promise.all([listUsers(), getAppRoleMap()])

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'KNetraHub'
  workbook.created = new Date()

  // ── Sheet 1: resolved per-user access snapshot ──────────────────────────
  const usersSheet = workbook.addWorksheet('User Access')
  usersSheet.columns = [
    { header: 'Username', key: 'username', width: 20 },
    { header: 'Display name', key: 'displayName', width: 24 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Global role', key: 'role', width: 12 },
    { header: 'Source', key: 'source', width: 10 },
    { header: 'Docker tier', key: 'docker', width: 12 },
    { header: 'Monitoring tier', key: 'monitoring', width: 14 },
    { header: 'IP Management tier', key: 'ipmgt', width: 18 },
    { header: 'Realm roles (as of last login)', key: 'realmRoles', width: 42 },
    { header: 'Created', key: 'createdAt', width: 20 },
    { header: 'Last login', key: 'lastLogin', width: 20 }
  ]
  usersSheet.getRow(1).font = { bold: true }
  usersSheet.autoFilter = { from: 'A1', to: 'K1' }
  usersSheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const u of users) {
    const realmRoles = u.realmRoles || []
    const apps = resolveEntitlements({ role: u.role, source: u.source }, realmRoles, roleMap)
    usersSheet.addRow({
      username: u.username,
      displayName: u.displayName,
      email: u.email || '',
      role: u.role,
      source: u.source,
      docker: apps.docker || 'No access',
      monitoring: apps.monitoring || 'No access',
      ipmgt: apps.ipmgt || 'No access',
      realmRoles: realmRoles.join(', ') || (u.source === 'local' ? '(local account)' : '—'),
      createdAt: u.createdAt,
      lastLogin: u.lastLogin || 'never'
    })
  }

  // ── Sheet 2: static tier -> permission reference (target vocabulary) ────
  const matrixSheet = workbook.addWorksheet('Permission Matrix')
  matrixSheet.columns = [
    { header: 'Sub-app', key: 'app', width: 18 },
    { header: 'Tier', key: 'tier', width: 12 },
    { header: 'Cumulative permissions granted', key: 'perms', width: 90 }
  ]
  matrixSheet.getRow(1).font = { bold: true }
  matrixSheet.views = [{ state: 'frozen', ySplit: 1 }]
  for (const app of APP_KEYS) {
    for (const tier of TIERS) {
      matrixSheet.addRow({ app: APP_LABELS[app] || app, tier, perms: cumulativeAppPermissions(app, tier).join(', ') || '(none)' })
    }
  }

  // ── Sheet 3: identity-provider role -> tier mapping (Settings > App & Access) ──
  const mapSheet = workbook.addWorksheet('Realm Role Mapping')
  mapSheet.columns = [
    { header: 'Sub-app', key: 'app', width: 18 },
    { header: 'Tier', key: 'tier', width: 12 },
    { header: 'Realm roles granting this tier', key: 'roles', width: 60 }
  ]
  mapSheet.getRow(1).font = { bold: true }
  mapSheet.views = [{ state: 'frozen', ySplit: 1 }]
  for (const app of APP_KEYS) {
    for (const tier of TIERS) {
      mapSheet.addRow({ app: APP_LABELS[app] || app, tier, roles: (roleMap[app]?.[tier] || []).join(', ') || '(none configured)' })
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()

  await audit({
    actor: actor.username,
    action: 'system.user_authority.export',
    detail: `Exported access report for ${users.length} users`
  })

  const filename = `user-authority-${new Date().toISOString().slice(0, 10)}.xlsx`
  setResponseHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  return buffer
})
