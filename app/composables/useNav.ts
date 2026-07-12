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
    label: 'Administration',
    items: [
      { label: 'Settings',   to: '/docker/settings',   icon: 'i-lucide-settings',    permission: 'docker.manage' },
      { label: 'Logs',       to: '/docker/logs',       icon: 'i-lucide-scroll-text', permission: 'docker.manage' }
    ]
  }
]

// The Monitoring app's navigation. Network (PRTG-style) and Server (Zabbix-style)
// are NOT separate sections — the sidebar is one unified tree organised by
// FUNCTION, interleaving network + server items under shared headers. Features
// that exist in both domains are single unified pages, not duplicated per
// domain: the dashboard (/monitoring, a customizable widget canvas with widget
// types for both domains), Problems (/monitoring/problems), Discovery
// (/monitoring/discovery), Maps (/monitoring/maps), Groups (/monitoring/groups),
// and Settings (/monitoring/settings) each show a `type`/domain tag per
// row/node/section instead of living on separate routes. Data still lives
// under /api/net and /api/server underneath.
const MONITORING_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Overview', to: '/monitoring', icon: 'i-lucide-radar', permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Monitoring',
    items: [
      { label: 'Problems',    to: '/monitoring/problems',          icon: 'i-lucide-triangle-alert', permission: 'monitoring.view' },
      { label: 'Sensors',     to: '/monitoring/network/sensors',   icon: 'i-lucide-gauge',          permission: 'monitoring.view' },
      { label: 'Latest data', to: '/monitoring/server/latestdata', icon: 'i-lucide-list',           permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Assets',
    items: [
      { label: 'Devices',   to: '/monitoring/network/devices', icon: 'i-lucide-router',    permission: 'monitoring.view' },
      { label: 'Hosts',     to: '/monitoring/server/hosts',     icon: 'i-lucide-server',    permission: 'monitoring.view' },
      { label: 'Discovery', to: '/monitoring/discovery',        icon: 'i-lucide-scan-line', permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Maps & Topology',
    items: [
      { label: 'Maps',   to: '/monitoring/maps',           icon: 'i-lucide-map',         permission: 'monitoring.view' },
      { label: 'Probes', to: '/monitoring/network/probes', icon: 'i-lucide-radio-tower', permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Traffic & Logs',
    items: [
      { label: 'NetFlow',    to: '/monitoring/network/flows',  icon: 'i-lucide-arrow-left-right', permission: 'monitoring.view' },
      { label: 'Syslog',     to: '/monitoring/network/syslog', icon: 'i-lucide-scroll-text',      permission: 'monitoring.view' },
      { label: 'SNMP Traps', to: '/monitoring/server/traps',   icon: 'i-lucide-radio',            permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports',     to: '/monitoring/network/reports', icon: 'i-lucide-file-text',    permission: 'monitoring.view' },
      { label: 'AI Insights', to: '/monitoring/network/ai',      icon: 'i-lucide-sparkles',     permission: 'monitoring.view' },
      { label: 'Services',    to: '/monitoring/server/services', icon: 'i-lucide-gauge-circle', permission: 'monitoring.view' },
      { label: 'Web',         to: '/monitoring/server/web',      icon: 'i-lucide-globe',        permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Groups',       to: '/monitoring/groups',              icon: 'i-lucide-folder-tree',     permission: 'monitoring.view' },
      { label: 'Templates',    to: '/monitoring/server/templates',    icon: 'i-lucide-layout-template', permission: 'monitoring.view' },
      { label: 'Triggers',     to: '/monitoring/server/triggers',     icon: 'i-lucide-zap',             permission: 'monitoring.view' },
      { label: 'Alert rules',  to: '/monitoring/network/alerts',      icon: 'i-lucide-bell-ring',       permission: 'monitoring.view' },
      { label: 'Maintenance',  to: '/monitoring/server/maintenance',  icon: 'i-lucide-wrench',          permission: 'monitoring.view' },
      { label: 'Actions',      to: '/monitoring/server/actions',      icon: 'i-lucide-bell-plus',       permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Administration',
    items: [
      { label: 'Settings',   to: '/monitoring/settings',   icon: 'i-lucide-settings',    permission: 'monitoring.manage' },
      { label: 'Logs',       to: '/monitoring/logs',       icon: 'i-lucide-scroll-text', permission: 'monitoring.scan' }
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
    label: 'Tools',
    items: [
      { label: 'Search',     to: '/ipmgt/search', icon: 'i-lucide-search',     permission: 'ipmgt.view' },
      { label: 'Calculator', to: '/ipmgt/tools',  icon: 'i-lucide-calculator', permission: 'ipmgt.view' }
    ]
  },
  {
    label: 'Administration',
    items: [
      { label: 'Settings',   to: '/ipmgt/settings',   icon: 'i-lucide-settings',    permission: 'ipmgt.settings' },
      { label: 'Logs',       to: '/ipmgt/logs',       icon: 'i-lucide-scroll-text', permission: 'ipmgt.create' }
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
    label: 'Security',
    items: [
      { label: 'Users',          to: '/users',                icon: 'i-lucide-users',        minRole: 'admin' },
      { label: 'User authority', to: '/admin/user-authority', icon: 'i-lucide-shield-half',  minRole: 'manager' },
      { label: 'App & Access',   to: '/admin/access',         icon: 'i-lucide-layout-grid',  minRole: 'admin' },
      { label: 'Authentication', to: '/admin/authentication', icon: 'i-lucide-shield-check', minRole: 'admin' }
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
      { label: 'Profile',         to: '/preferences/profile',       icon: 'i-lucide-user-round' },
      { label: 'Password change', to: '/preferences/password',      icon: 'i-lucide-key-round', localOnly: true },
      { label: 'Notifications',   to: '/preferences/notifications', icon: 'i-lucide-bell' }
    ]
  },
  {
    label: 'Security',
    items: [
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
 *    app): the sectioned admin menu (General / Security / Logs), with NO Apps
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
