export interface NavItem {
  label: string
  to: string
  icon: string
  minRole?: 'viewer' | 'operator' | 'admin'
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
      { label: 'Networks', to: '/networks', icon: 'i-lucide-network',        permission: 'docker.view' },
      { label: 'Volumes',  to: '/volumes',  icon: 'i-lucide-hard-drive',     permission: 'docker.view' },
      { label: 'Secrets',  to: '/secrets',  icon: 'i-lucide-key-round',      permission: 'docker.view' },
      { label: 'Configs',  to: '/configs',  icon: 'i-lucide-file-cog',       permission: 'docker.view' },
      { label: 'Registry', to: '/registry', icon: 'i-lucide-package-search', permission: 'docker.view' }
    ]
  },
  {
    label: 'Dock admin',
    items: [
      { label: 'Registries', to: '/registries',      icon: 'i-lucide-package',  permission: 'docker.manage' },
      { label: 'Settings',   to: '/docker/settings', icon: 'i-lucide-settings', permission: 'docker.manage' }
    ]
  }
]

// The Monitoring app's navigation (merged Network + Server). Shown only while
// the user is inside the Monitoring app; items gated by the user's per-app
// monitoring tier. Network (PRTG-style) and Server (Zabbix-style) are sections
// within the one app; the data still lives under /api/net and /api/server.
const MONITORING_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Overview', to: '/monitoring', icon: 'i-lucide-radar', permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Network',
    items: [
      { label: 'Dashboard', to: '/monitoring/network',         icon: 'i-lucide-network', permission: 'monitoring.view' },
      { label: 'Devices',   to: '/monitoring/network/devices', icon: 'i-lucide-router',  permission: 'monitoring.view' },
      { label: 'Sensors',   to: '/monitoring/network/sensors', icon: 'i-lucide-gauge',   permission: 'monitoring.view' },
      { label: 'Maps',      to: '/monitoring/network/maps',    icon: 'i-lucide-map',     permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Network Traffic & Logs',
    items: [
      { label: 'Alerts',  to: '/monitoring/network/alerts', icon: 'i-lucide-bell-ring',        permission: 'monitoring.view' },
      { label: 'NetFlow', to: '/monitoring/network/flows',  icon: 'i-lucide-arrow-left-right', permission: 'monitoring.view' },
      { label: 'Syslog',  to: '/monitoring/network/syslog', icon: 'i-lucide-scroll-text',      permission: 'monitoring.view' },
      { label: 'Groups',  to: '/monitoring/network/groups', icon: 'i-lucide-folder-tree',      permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Network Infrastructure',
    items: [
      { label: 'Discovery', to: '/monitoring/network/discovery', icon: 'i-lucide-scan-line',   permission: 'monitoring.view' },
      { label: 'Probes',    to: '/monitoring/network/probes',    icon: 'i-lucide-radio-tower', permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Network Insights',
    items: [
      { label: 'Reports',     to: '/monitoring/network/reports', icon: 'i-lucide-file-text', permission: 'monitoring.view' },
      { label: 'AI Insights', to: '/monitoring/network/ai',      icon: 'i-lucide-sparkles',  permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Server',
    items: [
      { label: 'Dashboard',   to: '/monitoring/server',            icon: 'i-lucide-server-cog',     permission: 'monitoring.view' },
      { label: 'Hosts',       to: '/monitoring/server/hosts',      icon: 'i-lucide-server',         permission: 'monitoring.view' },
      { label: 'Latest data', to: '/monitoring/server/latestdata', icon: 'i-lucide-list',           permission: 'monitoring.view' },
      { label: 'Problems',    to: '/monitoring/server/problems',   icon: 'i-lucide-triangle-alert', permission: 'monitoring.view' },
      { label: 'Maps',        to: '/monitoring/server/maps',       icon: 'i-lucide-map',            permission: 'monitoring.view' },
      { label: 'Services',    to: '/monitoring/server/services',   icon: 'i-lucide-gauge-circle',   permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Server Configuration',
    items: [
      { label: 'Host groups', to: '/monitoring/server/groups',      icon: 'i-lucide-folder-tree',  permission: 'monitoring.view' },
      { label: 'Templates',   to: '/monitoring/server/templates',   icon: 'i-lucide-layout-template', permission: 'monitoring.view' },
      { label: 'Triggers',    to: '/monitoring/server/triggers',    icon: 'i-lucide-zap',          permission: 'monitoring.view' },
      { label: 'Discovery',   to: '/monitoring/server/discovery',   icon: 'i-lucide-scan-line',    permission: 'monitoring.view' },
      { label: 'Web',         to: '/monitoring/server/web',         icon: 'i-lucide-globe',        permission: 'monitoring.view' },
      { label: 'Maintenance', to: '/monitoring/server/maintenance', icon: 'i-lucide-wrench',       permission: 'monitoring.view' },
      { label: 'Actions',     to: '/monitoring/server/actions',     icon: 'i-lucide-bell-ring',    permission: 'monitoring.view' }
    ]
  },
  {
    label: 'Monitoring admin',
    items: [
      { label: 'Network settings', to: '/monitoring/network/settings', icon: 'i-lucide-settings', permission: 'monitoring.manage' },
      { label: 'Server settings',  to: '/monitoring/server/settings',  icon: 'i-lucide-settings', permission: 'monitoring.manage' }
    ]
  }
]

// The IP Management app's navigation.
const IPMGT_GROUPS: NavGroup[] = [
  {
    label: 'IP Management',
    items: [
      { label: 'Overview',  to: '/ipmgt',           icon: 'i-lucide-radar',       permission: 'ipmgt.view' },
      { label: 'Subnets',   to: '/ipmgt/subnets',   icon: 'i-lucide-network',     permission: 'ipmgt.view' },
      { label: 'Addresses', to: '/ipmgt/addresses', icon: 'i-lucide-list-ordered',permission: 'ipmgt.view' }
    ]
  },
  {
    label: 'IP Management admin',
    items: [
      { label: 'Settings', to: '/ipmgt/settings', icon: 'i-lucide-settings', permission: 'ipmgt.delete' }
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
      { label: 'App & Access',   to: '/admin/access',         icon: 'i-lucide-layout-grid',  minRole: 'admin' },
      { label: 'Authentication', to: '/admin/authentication', icon: 'i-lucide-shield-check', minRole: 'admin' }
    ]
  },
  {
    label: 'Logs',
    items: [
      { label: 'Audit log',  to: '/audit',            icon: 'i-lucide-scroll-text', minRole: 'admin' },
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
