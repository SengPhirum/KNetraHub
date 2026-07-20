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
    label: 'Configuration',
    items: [
      { label: 'Email', to: '/admin/configuration/email', icon: 'i-lucide-mail', minRole: 'admin' }
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
      { label: 'Profile',            to: '/preferences/profile',       icon: 'i-lucide-user-round' },
      { label: 'Password & security', to: '/preferences/password',     icon: 'i-lucide-key-round' },
      { label: 'Notifications',      to: '/preferences/notifications', icon: 'i-lucide-bell' }
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
