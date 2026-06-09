export interface NavItem {
  label: string
  to: string
  icon: string
  minRole?: 'viewer' | 'operator' | 'admin'
}
export interface NavGroup {
  label: string
  items: NavItem[]
}

export function useNav(): NavGroup[] {
  return [
    {
      label: 'Overview',
      items: [{ label: 'Dashboard', to: '/', icon: 'i-lucide-radar' }]
    },
    {
      label: 'Fleet',
      items: [{ label: 'Nodes', to: '/nodes', icon: 'i-lucide-server' }]
    },
    {
      label: 'Workloads',
      items: [
        { label: 'Stacks', to: '/stacks', icon: 'i-lucide-layers' },
        { label: 'Services', to: '/services', icon: 'i-lucide-boxes' },
        { label: 'Tasks', to: '/tasks', icon: 'i-lucide-list-checks' },
        { label: 'Containers', to: '/containers', icon: 'i-lucide-container' }
      ]
    },
    {
      label: 'Data',
      items: [
        { label: 'Networks', to: '/networks', icon: 'i-lucide-network' },
        { label: 'Volumes', to: '/volumes', icon: 'i-lucide-hard-drive' },
        { label: 'Secrets', to: '/secrets', icon: 'i-lucide-key-round' },
        { label: 'Configs', to: '/configs', icon: 'i-lucide-file-cog' }
      ]
    },
    {
      label: 'Administration',
      items: [
        { label: 'Registries', to: '/registries', icon: 'i-lucide-package', minRole: 'admin' },
        { label: 'Users', to: '/users', icon: 'i-lucide-users', minRole: 'admin' },
        { label: 'Audit log', to: '/audit', icon: 'i-lucide-scroll-text', minRole: 'admin' },
        { label: 'Settings', to: '/settings', icon: 'i-lucide-settings' }
      ]
    }
  ]
}
