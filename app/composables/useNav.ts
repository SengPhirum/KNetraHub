export interface NavItem {
  label: string
  to: string
  icon: string
  minRole?: 'viewer' | 'operator' | 'manager' | 'admin'
  permission?: Permission
  target?: string
  /** Show only for local accounts (hidden for LDAP/OIDC, whose credentials live
   *  in the directory/provider). e.g. the self-service password change. */
  localOnly?: boolean
}
export interface NavGroup {
  label: string
  items: NavItem[]
}

// The Dock app's own navigation (the former global sidebar). Shown only while
// the user is inside the Dock app. Items gated by docker.* permissions resolve
// against the user's per-app docker tier (see useAuth.hasPermission).
const DOCK_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/docker', icon: 'i-lucide-radar', permission: 'docker.view' }]
  },
  {
    label: 'Fleet',
    items: [{ label: 'Nodes', to: '/nodes', icon: 'i-lucide-server', permission: 'docker.view' }]
  },
  {
    label: 'Workloads',
    items: [
      { label: 'Stacks',     to: '/stacks',     icon: 'i-lucide-layers',      permission: 'docker.view' },
      { label: 'Services',   to: '/services',   icon: 'i-lucide-boxes',       permission: 'docker.view' },
      { label: 'Tasks',      to: '/tasks',      icon: 'i-lucide-list-checks', permission: 'docker.view' },
      { label: 'Containers', to: '/containers', icon: 'i-lucide-container',   permission: 'docker.view' }
    ]
  },
  {
    label: 'Data',
    items: [
      { label: 'Networks',   to: '/networks', icon: 'i-lucide-network',        permission: 'docker.view' },
      { label: 'Volumes',    to: '/volumes',  icon: 'i-lucide-hard-drive',     permission: 'docker.view' },
      { label: 'Secrets',    to: '/secrets',  icon: 'i-lucide-key-round',      permission: 'docker.view' },
      { label: 'Configs',    to: '/configs',  icon: 'i-lucide-file-cog',       permission: 'docker.view' },
      { label: 'Registries', to: '/registry', icon: 'i-lucide-package-search', permission: 'docker.view' }
    ]
  },
  {
    label: 'Alerts',
    items: [
      { label: 'Alert Rules',      to: '/docker/alerts',            icon: 'i-lucide-bell-ring', permission: 'docker.manage' },
      { label: 'Alert Transports', to: '/docker/alerts/transports', icon: 'i-lucide-send',      permission: 'docker.manage' }
    ]
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users',      to: '/docker/users',      icon: 'i-lucide-users',       permission: 'docker.audit' },
      { label: 'Settings',   to: '/docker/settings',   icon: 'i-lucide-settings',    permission: 'docker.manage' },
      { label: 'Logs',       to: '/docker/logs',       icon: 'i-lucide-scroll-text', permission: 'docker.manage' }
    ]
  }
]

// The Monitoring app's navigation (LibreNMS-equivalent). One unified device
// model — there is no network/server split: routers, switches, firewalls,
// servers, printers, UPSes and every other SNMP/ICMP target are all "devices"
// whose capabilities were discovered, and the sidebar is organised by function
// exactly like LibreNMS's menu. Data lives under /api/monitoring/v1.
const MONITORING_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Overview', to: '/monitoring', icon: 'i-lucide-radar', permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Devices',
    items: [
      { label: 'All Devices',   to: '/monitoring/devices',           icon: 'i-lucide-router',      permission: 'monitoring.view' },
      { label: 'Device Groups', to: '/monitoring/device-groups',     icon: 'i-lucide-folder-tree', permission: 'monitoring.view' },
      { label: 'Locations',     to: '/monitoring/locations',         icon: 'i-lucide-map-pin',     permission: 'monitoring.view' },
      { label: 'Discovery',     to: '/monitoring/discovery',         icon: 'i-lucide-scan-line',   permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Health & Inventory',
    items: [
      { label: 'Ports',      to: '/monitoring/ports',      icon: 'i-lucide-ethernet-port', permission: 'monitoring.view' },
      { label: 'Sensors',    to: '/monitoring/health',     icon: 'i-lucide-gauge',         permission: 'monitoring.view' },
      { label: 'Processors', to: '/monitoring/processors', icon: 'i-lucide-cpu',           permission: 'monitoring.view' },
      { label: 'Memory',     to: '/monitoring/memory',     icon: 'i-lucide-memory-stick',  permission: 'monitoring.view' },
      { label: 'Storage',    to: '/monitoring/storage',    icon: 'i-lucide-hard-drive',    permission: 'monitoring.view' },
      { label: 'Inventory',  to: '/monitoring/inventory',  icon: 'i-lucide-package',       permission: 'monitoring.view' },
      { label: 'Wireless',   to: '/monitoring/wireless',   icon: 'i-lucide-wifi',          permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Network',
    items: [
      { label: 'Routing (BGP/OSPF)', to: '/monitoring/routing',   icon: 'i-lucide-route',            permission: 'monitoring.view' },
      { label: 'Switching (VLAN/FDB/ARP)', to: '/monitoring/switching', icon: 'i-lucide-arrow-left-right', permission: 'monitoring.view' },
      { label: 'Maps',               to: '/monitoring/maps',      icon: 'i-lucide-map',              permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Services & Apps',
    items: [
      { label: 'Services',     to: '/monitoring/services',     icon: 'i-lucide-gauge-circle', permission: 'monitoring.view' },
      { label: 'Applications', to: '/monitoring/applications', icon: 'i-lucide-app-window',   permission: 'monitoring.view' },
      { label: 'Billing',      to: '/monitoring/billing',      icon: 'i-lucide-receipt',      permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Alerts',
    items: [
      { label: 'Active Alerts',    to: '/monitoring/alerts',            icon: 'i-lucide-triangle-alert',  permission: 'monitoring.view' },
      { label: 'Alert Rules',      to: '/monitoring/alerts/rules',      icon: 'i-lucide-bell-ring',       permission: 'monitoring.view' },
      { label: 'Alert Transports', to: '/monitoring/alerts/transports', icon: 'i-lucide-send',            permission: 'monitoring.view' },
      { label: 'Alert Templates',  to: '/monitoring/alerts/templates',  icon: 'i-lucide-layout-template', permission: 'monitoring.view' },
      { label: 'Maintenance',      to: '/monitoring/maintenance',       icon: 'i-lucide-wrench',          permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Logs',
    items: [
      { label: 'Event Log',  to: '/monitoring/logs/events', icon: 'i-lucide-list',        permission: 'monitoring.view' },
      { label: 'Syslog',     to: '/monitoring/logs/syslog', icon: 'i-lucide-scroll-text', permission: 'monitoring.view' },
      { label: 'SNMP Traps', to: '/monitoring/logs/traps',  icon: 'i-lucide-radio',       permission: 'monitoring.view' },
      { label: 'Alert Log',  to: '/monitoring/logs/alerts', icon: 'i-lucide-bell',        permission: 'monitoring.view' }
    ]
  },
  {
    label: 'System',
    items: [
      { label: 'Pollers',         to: '/monitoring/pollers',         icon: 'i-lucide-radio-tower',   permission: 'monitoring.view' },
      { label: 'Data Collection', to: '/monitoring/data-collection', icon: 'i-lucide-database-zap',  permission: 'monitoring.view' },
      { label: 'SNMP Credentials', to: '/monitoring/settings/credentials', icon: 'i-lucide-key-round', permission: 'monitoring.manage' },
      { label: 'Settings',        to: '/monitoring/settings',        icon: 'i-lucide-settings',      permission: 'monitoring.manage' },
      { label: 'Logs',            to: '/monitoring/logs',            icon: 'i-lucide-file-terminal', permission: 'monitoring.scan' }
    ]
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users', to: '/monitoring/users', icon: 'i-lucide-users', permission: 'monitoring.alert' }
    ]
  }
]

// The IP Management (IPAM) app's navigation — a phpIPAM-style tree grouped by
// function: address space (sections/subnets/addresses), layer 2/3 (VLANs/VRFs),
// tools (search/calculator) and admin settings.
const IPMGT_GROUPS: NavGroup[] = [
  {
    label: 'Address Space',
    items: [
      { label: 'Dashboard',    to: '/ipmgt',           icon: 'i-lucide-layout-dashboard', permission: 'ipmgt.view' },
      { label: 'Sections',     to: '/ipmgt/sections',  icon: 'i-lucide-folder-tree',      permission: 'ipmgt.view' },
      { label: 'Subnets',      to: '/ipmgt/subnets',   icon: 'i-lucide-network',          permission: 'ipmgt.view' },
      { label: 'IP Addresses', to: '/ipmgt/addresses', icon: 'i-lucide-list-ordered',     permission: 'ipmgt.view' }
    ]
  },
  {
    label: 'Layer 2 / Layer 3',
    items: [
      { label: 'VLANs', to: '/ipmgt/vlans', icon: 'i-lucide-layers',   permission: 'ipmgt.view' },
      { label: 'VRFs',  to: '/ipmgt/vrfs',  icon: 'i-lucide-git-fork', permission: 'ipmgt.view' }
    ]
  },
  {
    label: 'Network Resources',
    items: [
      { label: 'Devices',   to: '/ipmgt/devices',   icon: 'i-lucide-server',      permission: 'ipmgt.view' },
      { label: 'Locations', to: '/ipmgt/locations', icon: 'i-lucide-map-pin',     permission: 'ipmgt.view' },
      { label: 'Customers', to: '/ipmgt/customers', icon: 'i-lucide-building-2',  permission: 'ipmgt.view' },
      { label: 'Racks',     to: '/ipmgt/racks',     icon: 'i-lucide-server-cog',  permission: 'ipmgt.view' },
      { label: 'Circuits',  to: '/ipmgt/circuits',  icon: 'i-lucide-cable',       permission: 'ipmgt.view' },
      { label: 'NAT',       to: '/ipmgt/nat',       icon: 'i-lucide-shuffle',     permission: 'ipmgt.view' }
    ]
  },
  {
    label: 'Discovery',
    items: [
      { label: 'Scan History', to: '/ipmgt/scans', icon: 'i-lucide-radar', permission: 'ipmgt.view' }
    ]
  },
  {
    label: 'Tools',
    items: [
      { label: 'Search',     to: '/ipmgt/search', icon: 'i-lucide-search',     permission: 'ipmgt.view' },
      { label: 'Calculator', to: '/ipmgt/tools',  icon: 'i-lucide-calculator', permission: 'ipmgt.view' }
    ]
  },
  {
    label: 'Alerts',
    items: [
      { label: 'Alert Rules',      to: '/ipmgt/alerts',            icon: 'i-lucide-bell-ring', permission: 'ipmgt.settings' },
      { label: 'Alert Transports', to: '/ipmgt/alerts/transports', icon: 'i-lucide-send',      permission: 'ipmgt.settings' }
    ]
  },
  {
    label: 'Operations',
    items: [
      { label: 'IP Requests',     to: '/ipmgt/requests',     icon: 'i-lucide-inbox',           permission: 'ipmgt.view' },
      { label: 'Import / Export', to: '/ipmgt/importexport', icon: 'i-lucide-arrow-left-right', permission: 'ipmgt.view' },
      { label: 'Vault',           to: '/ipmgt/vault',        icon: 'i-lucide-shield-check',     permission: 'ipmgt.view' }
    ]
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users',         to: '/ipmgt/users',       icon: 'i-lucide-users',       permission: 'ipmgt.approve' },
      { label: 'Custom Fields', to: '/ipmgt/customfields', icon: 'i-lucide-list-plus',   permission: 'ipmgt.settings' },
      { label: 'Settings',   to: '/ipmgt/settings',   icon: 'i-lucide-settings',    permission: 'ipmgt.settings' },
      { label: 'Logs',       to: '/ipmgt/logs',       icon: 'i-lucide-scroll-text', permission: 'ipmgt.create' }
    ]
  }
]

// The Privileged Access (PAM) app's navigation. Grouped by function — the
// secured vault (safes/accounts/platforms), discovery/onboarding, access
// requests and approvals, brokered sessions and recordings, application
// secrets, risk & compliance, and administration. Every item is
// permission-aware here for UX only; each API re-enforces the same permission
// AND the deeper policy layers (safe membership, approval state, ticket, MFA,
// time window, SoD) server-side. Data lives under /api/pam/v1.
const PAM_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', to: '/pam', icon: 'i-lucide-layout-dashboard', permission: 'pam.dashboard.view' }
    ]
  },
  {
    label: 'Vault',
    items: [
      { label: 'Safes',     to: '/pam/safes',     icon: 'i-lucide-vault',     permission: 'pam.safe.view' },
      { label: 'Accounts',  to: '/pam/accounts',  icon: 'i-lucide-key-round', permission: 'pam.account.view' },
      { label: 'Platforms', to: '/pam/platforms', icon: 'i-lucide-layers',    permission: 'pam.platform.view' }
    ]
  },
  {
    label: 'Discovery',
    items: [
      { label: 'Pending accounts', to: '/pam/discovery',         icon: 'i-lucide-inbox',       permission: 'pam.discovery.view' },
      { label: 'Sources',          to: '/pam/discovery/sources', icon: 'i-lucide-radar',       permission: 'pam.discovery.view' },
      { label: 'Onboarding rules', to: '/pam/discovery/rules',   icon: 'i-lucide-list-checks', permission: 'pam.discovery.view' }
    ]
  },
  {
    label: 'Access',
    items: [
      { label: 'Requests',      to: '/pam/requests',    icon: 'i-lucide-ticket',      permission: 'pam.request.view' },
      { label: 'Approvals',     to: '/pam/approvals',   icon: 'i-lucide-gavel',       permission: 'pam.request.approve' },
      { label: 'Active grants', to: '/pam/grants',      icon: 'i-lucide-badge-check', permission: 'pam.request.view' },
      { label: 'Just-in-time',  to: '/pam/jit',         icon: 'i-lucide-timer',       permission: 'pam.request.view' },
      { label: 'Break glass',   to: '/pam/break-glass', icon: 'i-lucide-siren',       permission: 'pam.request.create' },
      { label: 'Vendor access', to: '/pam/vendors',     icon: 'i-lucide-handshake',   permission: 'pam.safe.manage' }
    ]
  },
  {
    label: 'Sessions',
    items: [
      { label: 'Active sessions', to: '/pam/sessions',            icon: 'i-lucide-monitor-play', permission: 'pam.session.view' },
      { label: 'Recordings',      to: '/pam/sessions/recordings', icon: 'i-lucide-clapperboard', permission: 'pam.recording.view' }
    ]
  },
  {
    label: 'Applications',
    items: [
      { label: 'Secrets',      to: '/pam/secrets',      icon: 'i-lucide-file-key-2', permission: 'pam.secret.use' },
      { label: 'Applications', to: '/pam/applications', icon: 'i-lucide-boxes',      permission: 'pam.secret.use' }
    ]
  },
  {
    label: 'Risk & Compliance',
    items: [
      { label: 'Risk events',     to: '/pam/risk',           icon: 'i-lucide-shield-alert',    permission: 'pam.audit.view' },
      { label: 'Risk rules',      to: '/pam/risk/rules',     icon: 'i-lucide-sliders-horizontal', permission: 'pam.audit.view' },
      { label: 'Certifications',  to: '/pam/certifications', icon: 'i-lucide-clipboard-check',  permission: 'pam.certification.view' },
      { label: 'Reports',         to: '/pam/reports',        icon: 'i-lucide-file-bar-chart',   permission: 'pam.report.view' },
      { label: 'Audit integrity', to: '/pam/audit',          icon: 'i-lucide-fingerprint',      permission: 'pam.audit.view' }
    ]
  },
  {
    label: 'Administration',
    items: [
      { label: 'Access policies', to: '/pam/policies',   icon: 'i-lucide-scale',       permission: 'pam.policy.view' },
      { label: 'Connectors',      to: '/pam/connectors', icon: 'i-lucide-plug',        permission: 'pam.connector.view' },
      { label: 'Runners',         to: '/pam/runners',    icon: 'i-lucide-server-cog',  permission: 'pam.connector.view' },
      { label: 'Settings',        to: '/pam/settings',   icon: 'i-lucide-settings',    permission: 'pam.settings' },
      { label: 'Logs',            to: '/pam/logs',       icon: 'i-lucide-scroll-text', permission: 'pam.audit.view' }
    ]
  }
]

// The Work app's navigation (ClickUp-equivalent work management). Grouped by
// function — personal work (home/my tasks/everything), the workspace hierarchy
// (spaces → folders → lists), collaboration (Docs), tools (search) and
// administration. Only implemented destinations are listed here; sections of
// the reference product that are not built yet (Chat, Whiteboards, Goals,
// Dashboards, Forms, Automations, Sprints, migration) are deliberately absent
// rather than shown as dead menu items — see docs/work/feature-parity-matrix.md.
// Data lives under /api/work/v1.
const WORK_GROUPS: NavGroup[] = [
  {
    label: 'Home',
    items: [
      { label: 'Overview',  to: '/work',          icon: 'i-lucide-house',        permission: 'work.view' },
      { label: 'My Tasks',  to: '/work/my-tasks', icon: 'i-lucide-circle-user',  permission: 'work.view' }
    ]
  },
  {
    label: 'Workspace',
    items: [
      { label: 'Spaces',     to: '/work/spaces',     icon: 'i-lucide-layout-grid',  permission: 'work.view' },
      { label: 'Everything', to: '/work/everything', icon: 'i-lucide-list-checks',  permission: 'work.view' }
    ]
  },
  {
    label: 'Collaboration',
    items: [
      { label: 'Docs', to: '/work/docs', icon: 'i-lucide-file-text', permission: 'work.view' }
    ]
  },
  {
    label: 'Tools',
    items: [
      { label: 'Search', to: '/work/search', icon: 'i-lucide-search', permission: 'work.view' }
    ]
  },
  {
    label: 'Administration',
    items: [
      { label: 'Settings', to: '/work/settings', icon: 'i-lucide-settings',    permission: 'work.settings' },
      { label: 'Activity', to: '/work/activity', icon: 'i-lucide-history',     permission: 'work.audit' },
      { label: 'Logs',     to: '/work/logs',     icon: 'i-lucide-scroll-text', permission: 'work.audit' }
    ]
  }
]

// The portal admin area's sidebar, grouped into sections. Shown on the admin
// setting pages (/admin/*) and the existing /users and /audit pages - i.e.
// whenever the user is at the portal level rather than inside an app. Every
// item is admin-only (filtered by SidebarNav). There is deliberately no "Apps"
// link here (the sidebar logo links home); the Logs section will grow as more
// log types land (the user-requested "...").
const ADMIN_GROUPS: NavGroup[] = [
  {
    label: 'General',
    items: [
      { label: 'Appearance', to: '/admin/appearance', icon: 'i-lucide-paintbrush', minRole: 'admin' },
      { label: 'Reference',  to: '/admin/reference',  icon: 'i-lucide-book-open',  minRole: 'admin' }
    ]
  },
  {
    label: 'Notifications',
    items: [
      { label: 'Email (SMTP)', to: '/admin/configuration/email',  icon: 'i-lucide-mail',           minRole: 'admin' },
      { label: 'Channels',     to: '/admin/notifications/channels',  icon: 'i-lucide-satellite-dish', minRole: 'admin' },
      { label: 'Templates',    to: '/admin/notifications/templates', icon: 'i-lucide-layout-template', minRole: 'admin' },
      // The portal's own alert engine — peer of each sub-app's Alert Rules.
      { label: 'Alert Rules',  to: '/admin/alerts',                  icon: 'i-lucide-bell-ring',    minRole: 'admin' }
    ]
  },
  {
    label: 'Security',
    items: [
      { label: 'Users',          to: '/users',                icon: 'i-lucide-users',        minRole: 'admin' },
      { label: 'User authority', to: '/admin/user-authority', icon: 'i-lucide-shield-half',  minRole: 'manager' },
      { label: 'App & Access',   to: '/admin/access',         icon: 'i-lucide-layout-grid',  minRole: 'admin' },
      { label: 'Authentication', to: '/admin/authentication', icon: 'i-lucide-shield-check', minRole: 'admin' }
    ]
  },
  {
    label: 'System',
    items: [
      { label: 'Modules',     to: '/admin/modules',     icon: 'i-lucide-blocks',  minRole: 'admin' },
      { label: 'Maintenance', to: '/admin/maintenance', icon: 'i-lucide-hard-hat', minRole: 'admin' }
    ]
  },
  {
    label: 'Logs',
    items: [
      { label: 'Audit log',  to: '/audit',            icon: 'i-lucide-scroll-text', minRole: 'manager' },
      { label: 'System log', to: '/admin/system-log', icon: 'i-lucide-file-text',   minRole: 'admin' }
    ]
  }
]

// The user-preferences sidebar, grouped into sections. Shown on /preferences/*.
// Open to any signed-in user (no minRole), so it's separate from ADMIN_GROUPS.
// The Security section grows as account-security features land (2FA, sessions…).
const PREFERENCES_GROUPS: NavGroup[] = [
  {
    label: 'General',
    items: [
      { label: 'Info',       to: '/preferences/info',       icon: 'i-lucide-circle-user' },
      { label: 'Appearance', to: '/preferences/appearance', icon: 'i-lucide-paintbrush' }
    ]
  },
  {
    label: 'Account',
    items: [
      { label: 'Profile',       to: '/preferences/profile',       icon: 'i-lucide-user-round' },
      { label: 'Password',      to: '/preferences/password',      icon: 'i-lucide-key-round' },
      { label: 'Notifications', to: '/preferences/notifications', icon: 'i-lucide-bell' }
    ]
  },
  {
    label: 'Security',
    items: [
      { label: 'Secret password', to: '/preferences/security-password', icon: 'i-lucide-lock-keyhole' },
      { label: 'API tokens',      to: '/preferences/tokens',         icon: 'i-lucide-square-asterisk' },
      { label: 'Two-factor auth', to: '/preferences/two-factor',     icon: 'i-lucide-shield-check' },
      { label: 'Active sessions', to: '/preferences/sessions',       icon: 'i-lucide-monitor-smartphone' },
      { label: 'Login activity',  to: '/preferences/login-activity', icon: 'i-lucide-history' }
    ]
  }
]

/**
 * Contextual navigation. The sidebar shows:
 *  - inside an app: a link back to the app launcher + that app's own navigation
 *    (including the app's own admin settings);
 *  - in user preferences (/preferences/*): the sectioned preferences menu
 *    (General / Account / Security), open to any signed-in user;
 *  - at the portal level (admin pages: /admin/*, /users, /audit - not inside any
 *    app): the sectioned admin menu (General / Configuration / Security / System
 *    / Logs), with NO Apps
 *    link (the sidebar logo links home);
 *  - always: Documentation, pinned to the bottom.
 * The home page (/) is full-page with no sidebar, so this isn't used there.
 * Returns a ComputedRef so it reacts to route (current app) changes.
 */
export function useNav(): ComputedRef<NavGroup[]> {
  const route = useRoute()
  return computed<NavGroup[]>(() => {
    const currentApp = appKeyForRoute(route.path)
    const inPreferences = route.path === '/preferences' || route.path.startsWith('/preferences/')
    const groups: NavGroup[] = []

    if (currentApp) {
      // Inside an app: back-to-launcher link + the app's own nav.
      // groups.push({ label: '', items: [{ label: 'Apps', to: '/', icon: 'i-lucide-layout-grid' }] })
      if (currentApp === 'docker') groups.push(...DOCK_GROUPS)
      else if (currentApp === 'monitoring') groups.push(...MONITORING_GROUPS)
      else if (currentApp === 'ipmgt') groups.push(...IPMGT_GROUPS)
      else if (currentApp === 'pam') groups.push(...PAM_GROUPS)
      else if (currentApp === 'work') groups.push(...WORK_GROUPS)
    } else if (inPreferences) {
      // User preferences: the sectioned preferences menu (no Apps link).
      groups.push(...PREFERENCES_GROUPS)
    } else {
      // Portal admin area: the sectioned admin menu (no Apps link).
      groups.push(...ADMIN_GROUPS)
    }

    groups.push({
      label: 'Documentation',
      items: [
        { label: 'Documentation', to: '/documentation', icon: 'i-lucide-book-open-text' }
      ]
    })

    return groups
  })
}
