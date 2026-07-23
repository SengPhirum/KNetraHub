// Type-only import (erased at build time, so this never bundles server code
// into the client) - server/utils/store.ts's Role stays the single source
// of truth rather than duplicating the union type here.
import type { Role } from '../../server/utils/store'

/**
 * Fine-grained permission model. Originally layered on the global
 * viewer/operator/manager/admin role; now it is *also* the vocabulary for
 * per-app access (see shared/utils/entitlements.ts): every permission belongs
 * to an app, and an app tier (viewer/operator/manager/admin) grants a subset
 * of that app's permissions. ROLE_PERMISSIONS (by global role) is kept for portal-level
 * checks (admin.* / dashboard.view) and as the source of truth for which
 * permissions exist.
 *
 * Frontend checks using these are for menu visibility/UX only. Every
 * subsystem API must re-check the same permission server-side; the portal
 * never substitutes a frontend check for a backend one.
 */
export const PERMISSIONS = [
  // Global
  'dashboard.view', 'alert.view', 'alert.manage', 'audit.view', 'audit.export', 'report.view', 'report.export',
  // KNetraHub-Docker
  'docker.view', 'docker.manage', 'docker.deploy', 'docker.audit', 'docker.registry.manage',
  // KNetraHub-Monitoring (merged Network + Server)
  'monitoring.view', 'monitoring.manage', 'monitoring.scan', 'monitoring.configure',
  'monitoring.metrics', 'monitoring.service.manage', 'monitoring.alert',
  // KNetraHub-IPMgt
  'ipmgt.view', 'ipmgt.create', 'ipmgt.update', 'ipmgt.delete', 'ipmgt.assign', 'ipmgt.export',
  'ipmgt.import', 'ipmgt.scan', 'ipmgt.request', 'ipmgt.approve', 'ipmgt.settings',
  // KNetraHub Work (centralized work / project management). The app tier is the
  // outer boundary; inside Work, private spaces and object-level sharing are
  // additionally enforced server-side (layers/work/server/utils/workAccess.ts).
  'work.view', 'work.export', 'work.comment', 'work.create', 'work.update', 'work.assign',
  'work.time', 'work.docs', 'work.chat', 'work.forms', 'work.goals', 'work.dashboard',
  'work.automate', 'work.approve', 'work.share', 'work.audit',
  'work.delete', 'work.settings', 'work.integrations', 'work.migrate',
  // KNetraHub PAM (Privileged Access Management). The KNetraHub app tier is only
  // the first authorization layer; every privileged action is additionally gated
  // by safe membership, account permissions, platform policy, approval state,
  // ticket status, step-up MFA, time window, risk policy and separation-of-duties
  // (server-side, see layers/pam/server/utils/pamPolicy.ts). Frontend visibility
  // is never sufficient authorization.
  'pam.view', 'pam.dashboard.view',
  'pam.safe.view', 'pam.safe.manage',
  'pam.account.view', 'pam.account.use', 'pam.account.reveal', 'pam.account.manage',
  'pam.account.delete', 'pam.account.rotate', 'pam.account.reconcile',
  'pam.discovery.view', 'pam.discovery.run', 'pam.discovery.manage',
  'pam.request.create', 'pam.request.view', 'pam.request.approve', 'pam.request.override',
  'pam.session.connect', 'pam.session.view', 'pam.session.monitor', 'pam.session.terminate',
  'pam.recording.view', 'pam.recording.export',
  'pam.platform.view', 'pam.platform.manage',
  'pam.secret.use', 'pam.secret.manage',
  'pam.policy.view', 'pam.policy.manage',
  'pam.connector.view', 'pam.connector.manage',
  'pam.report.view', 'pam.report.export',
  'pam.audit.view', 'pam.settings', 'pam.recovery.manage',
  // Admin
  'admin.users', 'admin.roles', 'admin.permissions', 'admin.settings', 'admin.modules'
] as const

export type Permission = typeof PERMISSIONS[number]

/**
 * Per-app permissions, split by tier. viewer ⊂ operator ⊂ manager ⊂ admin
 * within each app. This is the single source of truth that both the
 * global-role mapping (below) and the per-app entitlement model
 * (entitlements.ts) build on.
 *
 * `manager` sits between operator and admin: approval/oversight visibility
 * (e.g. seeing an app's audit trail) on top of everything operator can do,
 * but not the app's own system-configuration actions (still admin-only).
 */
type AppTier = 'viewer' | 'operator' | 'manager' | 'admin'
type AppTierPermissions = Record<AppTier, Permission[]>

export const APP_PERMISSIONS: Record<'docker' | 'monitoring' | 'work' | 'ipmgt' | 'pam', AppTierPermissions> = {
  docker: {
    viewer: ['docker.view'],
    operator: ['docker.manage', 'docker.deploy'],
    manager: ['docker.audit', 'docker.registry.manage'],
    admin: []
  },
  monitoring: {
    viewer: ['monitoring.view'],
    operator: ['monitoring.scan', 'monitoring.metrics'],
    manager: ['monitoring.alert'],
    admin: ['monitoring.manage', 'monitoring.configure', 'monitoring.service.manage']
  },
  // Work tiers, cumulative (viewer ⊂ operator ⊂ manager ⊂ admin):
  //  viewer   - see shared content, export what they can see.
  //  operator - create/update work, comment, use Docs/Chat/Forms, track time.
  //  manager  - team planning: Goals, Dashboards, Automations, approvals,
  //             sharing, and the Work audit trail.
  //  admin    - destructive deletes, workspace configuration, integrations,
  //             and the ClickUp migration engine.
  work: {
    viewer: ['work.view', 'work.export'],
    operator: [
      'work.comment', 'work.create', 'work.update', 'work.assign',
      'work.time', 'work.docs', 'work.chat', 'work.forms'
    ],
    manager: ['work.goals', 'work.dashboard', 'work.automate', 'work.approve', 'work.share', 'work.audit'],
    admin: ['work.delete', 'work.settings', 'work.integrations', 'work.migrate']
  },
  ipmgt: {
    viewer: ['ipmgt.view', 'ipmgt.export'],
    operator: ['ipmgt.create', 'ipmgt.update', 'ipmgt.assign', 'ipmgt.import', 'ipmgt.scan', 'ipmgt.request'],
    manager: ['ipmgt.approve'],
    admin: ['ipmgt.delete', 'ipmgt.settings']
  },
  // PAM tiers, cumulative (viewer ⊂ operator ⊂ manager ⊂ admin):
  //  viewer   - read-only, never retrieves/decrypts a credential.
  //  operator - request access, connect, use (inject) credentials, run allowed
  //             discovery, onboard/rotate/reconcile accounts where safe perms permit.
  //  manager  - approve requests, monitor/terminate sessions, view+export
  //             recordings and command audits, reveal credentials, review the
  //             PAM audit trail, export reports and run certifications.
  //  admin    - manage safes/platforms/policies/connectors/discovery/settings,
  //             delete accounts, override (emergency) approvals, and perform
  //             controlled key/DR recovery.
  pam: {
    viewer: [
      'pam.view', 'pam.dashboard.view', 'pam.safe.view', 'pam.account.view',
      'pam.platform.view', 'pam.policy.view', 'pam.connector.view', 'pam.discovery.view',
      'pam.request.view', 'pam.session.view', 'pam.report.view'
    ],
    operator: [
      'pam.request.create', 'pam.session.connect', 'pam.account.use',
      'pam.account.rotate', 'pam.account.reconcile', 'pam.account.manage',
      'pam.discovery.run', 'pam.secret.use'
    ],
    manager: [
      'pam.request.approve', 'pam.session.monitor', 'pam.session.terminate',
      'pam.recording.view', 'pam.recording.export', 'pam.account.reveal',
      'pam.audit.view', 'pam.report.export'
    ],
    admin: [
      'pam.safe.manage', 'pam.account.delete', 'pam.platform.manage', 'pam.policy.manage',
      'pam.connector.manage', 'pam.discovery.manage', 'pam.secret.manage',
      'pam.request.override', 'pam.settings', 'pam.recovery.manage'
    ]
  }
}

// Global permissions every authenticated viewer gets regardless of app access.
const VIEWER_GLOBAL: Permission[] = ['dashboard.view', 'alert.view', 'report.view']
const OPERATOR_GLOBAL: Permission[] = ['alert.manage']
// Manager's global add-ons: approval/oversight, not system configuration -
// reviewing the audit trail and exporting reports (see role docs).
const MANAGER_GLOBAL: Permission[] = ['audit.view', 'audit.export', 'report.export']

/**
 * Cumulative permission list for an app at a given tier (viewer..tier).
 * e.g. cumulativeAppPermissions('docker', 'operator') = view + manage + deploy.
 */
export function cumulativeAppPermissions(
  app: keyof typeof APP_PERMISSIONS,
  tier: AppTier
): Permission[] {
  const set = APP_PERMISSIONS[app]
  const out = [...set.viewer]
  if (tier === 'operator' || tier === 'manager' || tier === 'admin') out.push(...set.operator)
  if (tier === 'manager' || tier === 'admin') out.push(...set.manager)
  if (tier === 'admin') out.push(...set.admin)
  return out
}

const ALL_APP_VIEWER = Object.keys(APP_PERMISSIONS).flatMap((a) =>
  cumulativeAppPermissions(a as keyof typeof APP_PERMISSIONS, 'viewer')
)
const ALL_APP_OPERATOR = Object.keys(APP_PERMISSIONS).flatMap((a) =>
  cumulativeAppPermissions(a as keyof typeof APP_PERMISSIONS, 'operator')
)
const ALL_APP_MANAGER = Object.keys(APP_PERMISSIONS).flatMap((a) =>
  cumulativeAppPermissions(a as keyof typeof APP_PERMISSIONS, 'manager')
)

/**
 * Global-role → permissions. Retained for portal-level checks (admin pages,
 * dashboard) and backward compatibility. App-scoped access is now resolved
 * per app via entitlements.ts; this mapping reflects what a *global* role
 * implies (e.g. the local-admin superuser).
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  viewer: [...VIEWER_GLOBAL, ...ALL_APP_VIEWER],
  operator: [...VIEWER_GLOBAL, ...OPERATOR_GLOBAL, ...ALL_APP_OPERATOR],
  manager: [...VIEWER_GLOBAL, ...OPERATOR_GLOBAL, ...MANAGER_GLOBAL, ...ALL_APP_MANAGER],
  admin: [...PERMISSIONS]
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}
