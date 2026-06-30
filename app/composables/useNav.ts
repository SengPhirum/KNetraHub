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

// The Network app's navigation (PRTG-style monitoring). Shown only while the
// user is inside the Network app; items gated by the user's per-app net tier.
const NET_GROUPS: NavGroup[] = [
  {
    label: 'Monitoring',
    items: [
      { label: 'Overview', to: '/net',         icon: 'i-lucide-radar',  permission: 'net.view' },
      { label: 'Devices',  to: '/net/devices', icon: 'i-lucide-router', permission: 'net.view' },
      { label: 'Sensors',  to: '/net/sensors', icon: 'i-lucide-gauge',  permission: 'net.view' },
      { label: 'Maps',     to: '/net/maps',    icon: 'i-lucide-map',    permission: 'net.view' }
    ]
  },
  {
    label: 'Traffic & Logs',
    items: [
      { label: 'Alerts',  to: '/net/alerts', icon: 'i-lucide-bell-ring',        permission: 'net.view' },
      { label: 'NetFlow', to: '/net/flows',  icon: 'i-lucide-arrow-left-right', permission: 'net.view' },
      { label: 'Syslog',  to: '/net/syslog', icon: 'i-lucide-scroll-text',      permission: 'net.view' },
      { label: 'Groups',  to: '/net/groups', icon: 'i-lucide-folder-tree',      permission: 'net.view' }
    ]
  },
  {
    label: 'Infrastructure',
    items: [
      { label: 'Discovery', to: '/net/discovery', icon: 'i-lucide-scan-line',   permission: 'net.view' },
      { label: 'Probes',    to: '/net/probes',    icon: 'i-lucide-radio-tower', permission: 'net.view' }
    ]
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports',     to: '/net/reports', icon: 'i-lucide-file-text', permission: 'net.view' },
      { label: 'AI Insights', to: '/net/ai',      icon: 'i-lucide-sparkles',  permission: 'net.view' }
    ]
  },
  {
    label: 'Network admin',
    items: [
      { label: 'Settings', to: '/net/settings', icon: 'i-lucide-settings', permission: 'net.manage' }
    ]
  }
]

// The Server app's navigation (Zabbix-style monitoring).
const SERVER_GROUPS: NavGroup[] = [
  {
    label: 'Server',
    items: [
      { label: 'Overview', to: '/server',          icon: 'i-lucide-radar',          permission: 'server.view' },
      { label: 'Hosts',    to: '/server/hosts',    icon: 'i-lucide-server',         permission: 'server.view' },
      { label: 'Problems', to: '/server/problems', icon: 'i-lucide-triangle-alert', permission: 'server.view' }
    ]
  },
  {
    label: 'Server admin',
    items: [
      { label: 'Settings', to: '/server/settings', icon: 'i-lucide-settings', permission: 'server.manage' }
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
      else if (currentApp === 'net') groups.push(...NET_GROUPS)
      else if (currentApp === 'server') groups.push(...SERVER_GROUPS)
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
