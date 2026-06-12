<script setup lang="ts">
definePageMeta({ layout: false })

// ── Home section data ─────────────────────────────────────────────────────────
const appFeatures = [
  {
    icon: 'i-lucide-layers',
    title: 'Stack Management',
    desc: 'Deploy Docker Swarm stacks from compose files with full status tracking. One-click rollback with GitLab version history.'
  },
  {
    icon: 'i-lucide-boxes',
    title: 'Service Control',
    desc: 'Scale replicas, redeploy tasks, and update images across your swarm without touching the command line.'
  },
  {
    icon: 'i-lucide-radar',
    title: 'Live Monitoring',
    desc: 'Real-time SSE event stream — swarm health at a glance: nodes, services, tasks, and cluster capacity.'
  },
  {
    icon: 'i-lucide-shield-check',
    title: 'Access Control',
    desc: 'Three-role model (viewer, operator, admin) with local accounts, LDAP / Active Directory, and OIDC SSO.'
  },
  {
    icon: 'i-lucide-database',
    title: 'Infrastructure',
    desc: 'Manage networks, volumes, secrets, configs, and private registry credentials from one place.'
  },
  {
    icon: 'i-lucide-braces',
    title: 'REST API',
    desc: 'Fully documented REST API with interactive Swagger UI for automation, integrations, and CI pipelines.'
  }
]

const roles = [
  {
    name: 'Viewer',
    icon: 'i-lucide-eye',
    color: 'text-faint',
    bg: 'bg-hull/40 ring-hull',
    perms: ['Dashboard & metrics', 'Stacks (read-only)', 'Services & tasks', 'Nodes', 'Networks, volumes, secrets, configs']
  },
  {
    name: 'Operator',
    icon: 'i-lucide-wrench',
    color: 'text-beacon',
    bg: 'bg-beacon/10 ring-beacon/25',
    perms: ['All Viewer access', 'Deploy & update stacks', 'Scale & redeploy services', 'Update service images', 'Manage secrets & configs']
  },
  {
    name: 'Admin',
    icon: 'i-lucide-crown',
    color: 'text-running',
    bg: 'bg-running/10 ring-running/25',
    perms: ['All Operator access', 'Manage users & roles', 'Configure LDAP & OIDC', 'Registry credentials', 'Full audit log']
  }
]

const techStack: [string, string][] = [
  ['Runtime', 'Nuxt 3 (Vue 3) + TypeScript'],
  ['Database', 'SQLite via node:sqlite built-in'],
  ['Live events', 'Server-Sent Events (SSE)'],
  ['API spec', 'OpenAPI 3.1 / Swagger UI v5'],
  ['Auth', 'JWT · LDAP / AD · OIDC (PKCE)'],
  ['Docker', 'Unix socket or remote TCP/TLS']
]

const quickStart = [
  { n: '1', title: 'Copy env file', code: 'cp .env.example .env' },
  { n: '2', title: 'Set required vars', code: 'NUXT_JWT_SECRET=your-secret\nNUXT_ADMIN_USERNAME=admin\nNUXT_ADMIN_PASSWORD=your-password' },
  { n: '3', title: 'Mount Docker socket', code: 'volumes:\n  - /var/run/docker.sock:/var/run/docker.sock' },
  { n: '4', title: 'Start the app', code: 'docker compose up -d\n# then open http://localhost:3000' }
]

const homeNavCards = [
  { id: 'manual', label: 'User Manual', icon: 'i-lucide-book-open', desc: 'Feature guides for dashboard, stacks, services, nodes, access control, and daily workflows.' },
  { id: 'configuration', label: 'Configuration', icon: 'i-lucide-sliders-horizontal', desc: 'Runtime options, Docker connection, GitLab versioning, OIDC, LDAP, and local auth setup.' },
  { id: 'api', label: 'API Reference', icon: 'i-lucide-braces', desc: 'Interactive Swagger UI covering every REST endpoint with request/response schemas and try-it-out.' }
]

const apiEndpointGroups = [
  { tag: 'Auth',       icon: 'i-lucide-lock' },
  { tag: 'Stacks',     icon: 'i-lucide-layers' },
  { tag: 'Services',   icon: 'i-lucide-boxes' },
  { tag: 'Tasks',      icon: 'i-lucide-list-checks' },
  { tag: 'Nodes',      icon: 'i-lucide-server' },
  { tag: 'Networks',   icon: 'i-lucide-network' },
  { tag: 'Volumes',    icon: 'i-lucide-hard-drive' },
  { tag: 'Secrets',    icon: 'i-lucide-key-round' },
  { tag: 'Configs',    icon: 'i-lucide-file-cog' },
  { tag: 'Registries', icon: 'i-lucide-package' },
  { tag: 'Users',      icon: 'i-lucide-users' },
  { tag: 'Audit',      icon: 'i-lucide-scroll-text' },
]

// ── User Manual data ──────────────────────────────────────────────────────────
const featureGuides = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: 'i-lucide-radar',
    summary: 'Use the dashboard as the first stop for swarm health, capacity, task distribution, and live event status.',
    steps: [
      'Check Nodes ready before deploying or troubleshooting workloads.',
      'Use Services and Running tasks to spot scheduling drift quickly.',
      'When Live is idle, refresh manually or configure polling in Preferences.',
      'Open a node or service from the dashboard when a count looks wrong.'
    ],
    shot: {
      label: 'Dashboard', status: 'Live',
      metrics: [['Nodes ready', '3/3'], ['Services', '12'], ['Running tasks', '28'], ['Cluster capacity', '24 CPU']] as [string, string][],
      rows: [['manager-01', 'Leader', 'Ready'], ['worker-01', 'Worker', 'Ready'], ['worker-02', 'Worker', 'Ready']] as [string, string, string][]
    }
  },
  {
    id: 'stacks',
    title: 'Stacks',
    icon: 'i-lucide-layers',
    summary: 'Deploy compose files into Docker Swarm and keep desired state visible in DockHub.',
    steps: [
      'Open Stacks, add or edit a compose file, then deploy it.',
      'Use service names, images, ports, networks, volumes, secrets, and configs supported by DockHub.',
      'When GitLab is configured, review commit history and roll back to a previous compose version.',
      'Watch service and task pages after deployment to verify replicas converge.'
    ],
    shot: {
      label: 'Stack detail', status: 'Versioned',
      metrics: [['Services', '4'], ['Networks', '2'], ['Configs', '1'], ['Secrets', '3']] as [string, string][],
      rows: [['web', 'nginx:1.27', 'Running'], ['api', 'registry/app:2026.06', 'Running'], ['worker', 'registry/worker:2026.06', 'Pending']] as [string, string, string][]
    }
  },
  {
    id: 'services',
    title: 'Services',
    icon: 'i-lucide-boxes',
    summary: 'Inspect running services, scale replicas, redeploy tasks, update images, and read service logs.',
    steps: [
      'Open Services to compare desired and running replicas.',
      'Use Scale for planned capacity changes.',
      'Use Redeploy when you need fresh tasks without changing the image tag.',
      'Use Update image when moving to a new image digest or tag.',
      'Read Logs and Tasks together to connect errors with the node where they happened.'
    ],
    shot: {
      label: 'Service detail', status: 'Running',
      metrics: [['Replicas', '3/3'], ['Image', 'app:stable'], ['Ports', '443:8443'], ['Mode', 'replicated']] as [string, string][],
      rows: [['task.1', 'manager-01', 'Running'], ['task.2', 'worker-01', 'Running'], ['task.3', 'worker-02', 'Running']] as [string, string, string][]
    }
  },
  {
    id: 'tasks-containers',
    title: 'Tasks and containers',
    icon: 'i-lucide-list-checks',
    summary: 'Use task and container pages when you need the scheduler view and the runtime container view side by side.',
    steps: [
      'Use Tasks to see placement, desired state, current state, and task-level failure reasons.',
      'Filter by service when a deployment only partially converges.',
      'Open Containers for container IDs, node placement, image details, and direct container logs.',
      'Use task history before deleting or redeploying so the original failure reason is not lost.'
    ],
    shot: {
      label: 'Task history', status: 'Mixed',
      metrics: [['Running', '28'], ['Failed', '2'], ['Pending', '1'], ['Shutdown', '11']] as [string, string][],
      rows: [['api.1', 'worker-01', 'Running'], ['api.2', 'worker-02', 'Failed'], ['web.1', 'manager-01', 'Running']] as [string, string, string][]
    }
  },
  {
    id: 'nodes',
    title: 'Nodes',
    icon: 'i-lucide-server',
    summary: 'Understand manager availability, worker readiness, node resources, and maintenance state.',
    steps: [
      'Use Nodes to confirm manager availability and worker readiness.',
      'Drain a node before planned maintenance.',
      'Activate a node after maintenance so the scheduler can place tasks again.',
      'Check node details when services are stuck pending because of resource or placement limits.'
    ],
    shot: {
      label: 'Node list', status: 'Healthy',
      metrics: [['Managers', '1'], ['Workers', '2'], ['CPU total', '24'], ['Memory total', '96 GB']] as [string, string][],
      rows: [['manager-01', 'Manager leader', 'Ready'], ['worker-01', 'Worker', 'Ready'], ['worker-02', 'Worker', 'Drain']] as [string, string, string][]
    }
  },
  {
    id: 'networks-volumes',
    title: 'Networks and volumes',
    icon: 'i-lucide-network',
    summary: 'Manage the swarm resources that connect services and persist service data.',
    steps: [
      'Create overlay networks before referencing them from a stack.',
      'Use attachable networks only when standalone containers need to join them.',
      'Create volumes before deploying services that need persistent data.',
      'Remove unused networks or volumes only after confirming no service depends on them.'
    ],
    shot: {
      label: 'Resource inventory', status: 'Ready',
      metrics: [['Networks', '5'], ['Volumes', '9'], ['Drivers', '2'], ['In use', '11']] as [string, string][],
      rows: [['frontend-net', 'overlay', 'Attachable'], ['db-data', 'local', 'In use'], ['cache-data', 'local', 'Unused']] as [string, string, string][]
    }
  },
  {
    id: 'secrets-configs',
    title: 'Secrets and configs',
    icon: 'i-lucide-key-round',
    summary: 'Create and review swarm secrets and configs consumed by services at deploy time.',
    steps: [
      'Create secrets for passwords, tokens, and private values.',
      'Treat secrets as write-only; create a new secret when a value changes.',
      'Create configs for non-sensitive text or files consumed by services.',
      'Update stacks after changing a referenced secret or config name.'
    ],
    shot: {
      label: 'Secret library', status: 'Protected',
      metrics: [['Secrets', '6'], ['Configs', '4'], ['Used', '8'], ['Unused', '2']] as [string, string][],
      rows: [['api_token', 'secret', 'Write-only'], ['nginx_conf', 'config', 'Readable'], ['db_password_v2', 'secret', 'In use']] as [string, string, string][]
    }
  },
  {
    id: 'registries',
    title: 'Registries',
    icon: 'i-lucide-package',
    summary: 'Store private registry credentials so stacks and services can pull private images.',
    steps: [
      'Add registry credentials before deploying stacks that use private images.',
      'Use a robot or deploy token with the narrowest needed access.',
      'Update credentials before token expiration to avoid failed rolling updates.',
      'Redeploy affected services after rotating image pull credentials.'
    ],
    shot: {
      label: 'Registry access', status: 'Admin',
      metrics: [['Registries', '2'], ['Private images', '14'], ['Expiring soon', '1'], ['Last pull', '2 min']] as [string, string][],
      rows: [['registry.gitlab.com', 'Deploy token', 'Active'], ['ghcr.io', 'Robot account', 'Active'], ['registry.local', 'Password', 'Rotate']] as [string, string, string][]
    }
  },
  {
    id: 'users-audit',
    title: 'Users and audit log',
    icon: 'i-lucide-users',
    summary: 'Manage local, LDAP, and OIDC users, then review important administrative events.',
    steps: [
      'Create local users for break-glass access and small teams.',
      'Use LDAP or OIDC groups to sync viewer, operator, and admin roles.',
      'Review the audit log after deploys, deletes, auth changes, and role changes.',
      'Keep at least one tested admin path outside the primary SSO provider.'
    ],
    shot: {
      label: 'Access control', status: 'Tracked',
      metrics: [['Users', '12'], ['Admins', '2'], ['Operators', '5'], ['Audit entries', '200']] as [string, string][],
      rows: [['viewer', 'Read-only', 'Safe'], ['operator', 'Workload control', 'Scoped'], ['admin', 'Full control', 'Restricted']] as [string, string, string][]
    }
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: 'i-lucide-settings',
    summary: 'Configure integration defaults, authentication providers, and UI-backed system settings.',
    steps: [
      'Use Authentication settings to enable LDAP or OIDC from the UI.',
      'Save provider settings to store database overrides instead of editing container env.',
      'Use env defaults when you want to delete a saved override and return to .env values.',
      'Keep secrets masked in the UI unless you are actively rotating them.'
    ],
    shot: {
      label: 'Authentication', status: 'Configurable',
      metrics: [['LDAP', 'Enabled'], ['OIDC', 'Ready'], ['Overrides', 'DB'], ['Fallback', 'Local admin']] as [string, string][],
      rows: [['Issuer', 'https://sso.example', 'Set'], ['Groups claim', 'groups', 'Mapped'], ['Redirect URI', 'Auto', 'Effective']] as [string, string, string][]
    }
  }
]

const workflows = [
  {
    title: 'Deploy a stack safely',
    icon: 'i-lucide-upload-cloud',
    steps: [
      'Confirm the target swarm manager is reachable from Dashboard or Nodes.',
      'Create required networks, volumes, secrets, and configs.',
      'Deploy the compose file from Stacks.',
      'Watch Services and Tasks until every replica reaches the expected state.'
    ]
  },
  {
    title: 'Troubleshoot a failed update',
    icon: 'i-lucide-stethoscope',
    steps: [
      'Open the affected service and compare desired and running replicas.',
      'Read task failure messages and container logs from the same node.',
      'Check registry credentials if the error is image pull related.',
      'Redeploy or update the image after correcting the root cause.'
    ]
  },
  {
    title: 'Prepare node maintenance',
    icon: 'i-lucide-wrench',
    steps: [
      'Drain the worker or manager node from Nodes.',
      'Wait for tasks to move or stop according to service policy.',
      'Complete host maintenance outside DockHub.',
      'Activate the node and confirm new tasks can be scheduled.'
    ]
  }
]

// ── Configuration data ────────────────────────────────────────────────────────
const configurationSections = [
  {
    id: 'integration',
    eyebrow: 'Integration',
    title: 'System and integration configuration',
    summary: 'These options connect DockHub to Docker, GitLab, persistent storage, and the visible app shell.',
    guides: [
      {
        id: 'runtime-config',
        title: 'Runtime configuration model',
        icon: 'i-lucide-sliders-horizontal',
        summary: 'Environment variables provide first-run defaults. Authentication settings saved in the UI are stored in SQLite and override those defaults until reset.',
        options: [
          ['NUXT_DATA_DIR', 'Directory for the SQLite user, audit, and app settings database. Defaults to ./.data.'],
          ['NUXT_JWT_SECRET', 'Secret used to sign session tokens. Use a long random value in production.'],
          ['NUXT_ADMIN_USERNAME', 'First-run local admin username, created only when no users exist.'],
          ['NUXT_ADMIN_PASSWORD', 'First-run local admin password, created only when no users exist.'],
          ['NUXT_PUBLIC_APP_NAME', 'Safe public label displayed in the app header and browser metadata.']
        ] as [string, string][],
        steps: [
          'Copy .env.example to .env before the first run.',
          'Set NUXT_JWT_SECRET and the first-run admin credentials before production use.',
          'Choose NUXT_DATA_DIR before running containers so the database path is stable.',
          'Use Settings > Authentication for LDAP and OIDC changes that should be stored in the database.'
        ],
        env: ['NUXT_DATA_DIR', 'NUXT_JWT_SECRET', 'NUXT_ADMIN_USERNAME', 'NUXT_ADMIN_PASSWORD', 'NUXT_PUBLIC_APP_NAME']
      },
      {
        id: 'docker-config',
        title: 'Docker engine',
        icon: 'i-lucide-container',
        summary: 'DockHub must reach a Docker Swarm manager. Use the local socket for co-located installs or TCP/TLS for remote managers.',
        options: [
          ['NUXT_DOCKER_SOCKET_PATH', 'Unix socket path for local Docker access. Default is /var/run/docker.sock.'],
          ['NUXT_DOCKER_HOST', 'Remote Docker manager hostname or IP. When set, TCP mode is used instead of the socket.'],
          ['NUXT_DOCKER_PORT', 'Remote Docker manager port, usually 2376 for TLS.'],
          ['NUXT_DOCKER_CA', 'CA certificate PEM content or file path for remote TLS.'],
          ['NUXT_DOCKER_CERT', 'Client certificate PEM content or file path for remote TLS.'],
          ['NUXT_DOCKER_KEY', 'Client private key PEM content or file path for remote TLS.']
        ] as [string, string][],
        steps: [
          'For local installs, mount /var/run/docker.sock into the app container.',
          'For remote installs, set host and port for a manager node.',
          'For TLS, provide the CA, client certificate, and client key.',
          'Confirm the connected node is a manager because swarm writes require manager access.'
        ],
        env: ['NUXT_DOCKER_SOCKET_PATH', 'NUXT_DOCKER_HOST', 'NUXT_DOCKER_PORT', 'NUXT_DOCKER_CA', 'NUXT_DOCKER_CERT', 'NUXT_DOCKER_KEY']
      },
      {
        id: 'gitlab-config',
        title: 'GitLab stack versioning',
        icon: 'i-lucide-git-branch',
        summary: 'GitLab stores compose files under a repository path so stack changes have commit history and rollback points.',
        options: [
          ['NUXT_GITLAB_URL', 'GitLab instance base URL. Defaults to https://gitlab.com.'],
          ['NUXT_GITLAB_TOKEN', 'Personal, project, or deploy token with API access to the configured project.'],
          ['NUXT_GITLAB_PROJECT_ID', 'Numeric GitLab project ID that stores compose files.'],
          ['NUXT_GITLAB_BRANCH', 'Branch where compose files are committed. Defaults to main.'],
          ['NUXT_GITLAB_STACKS_PATH', 'Repository folder for stack compose files. Defaults to stacks.']
        ] as [string, string][],
        steps: [
          'Create or choose a GitLab project for operations state.',
          'Create a token with API access to the project.',
          'Set the project ID, branch, and stacks path.',
          'Deploy a stack and verify the compose file appears under the configured path.',
          'Use stack history to view or roll back saved compose versions.'
        ],
        env: ['NUXT_GITLAB_URL', 'NUXT_GITLAB_TOKEN', 'NUXT_GITLAB_PROJECT_ID', 'NUXT_GITLAB_BRANCH', 'NUXT_GITLAB_STACKS_PATH']
      }
    ]
  },
  {
    id: 'authentication',
    eyebrow: 'Authentication',
    title: 'Authentication and role mapping',
    summary: 'DockHub supports local users, LDAP / Active Directory, and OIDC SSO. LDAP and OIDC can be configured from environment defaults or saved UI overrides.',
    guides: [
      {
        id: 'local-auth',
        title: 'Local accounts',
        icon: 'i-lucide-user-round-cog',
        summary: 'Local users are stored in the DockHub database and are useful for first-run access, break-glass administration, and smaller teams.',
        options: [
          ['First-run admin', 'Created from NUXT_ADMIN_USERNAME and NUXT_ADMIN_PASSWORD only when no users exist.'],
          ['Roles', 'Viewer can read, operator can control workloads, admin can manage users/settings/integrations.'],
          ['Fallback access', 'Keep one tested local admin while rolling out LDAP or OIDC.']
        ] as [string, string][],
        steps: [
          'Set the first-run admin credentials before bootstrapping production.',
          'Create named local users from Users when needed.',
          'Use a local admin to recover access if external identity providers are down.'
        ],
        env: ['NUXT_ADMIN_USERNAME', 'NUXT_ADMIN_PASSWORD', 'NUXT_JWT_SECRET']
      },
      {
        id: 'oidc-config',
        title: 'OIDC SSO',
        icon: 'i-lucide-key-round',
        summary: 'OIDC uses authorization code flow with PKCE and discovers provider endpoints from the issuer URL.',
        options: [
          ['NUXT_OIDC_ENABLED', 'Turns OIDC login on by default. UI overrides can also enable or disable it.'],
          ['NUXT_OIDC_ISSUER', 'Provider issuer URL. DockHub reads {issuer}/.well-known/openid-configuration.'],
          ['NUXT_OIDC_CLIENT_ID', 'Client ID registered at the provider.'],
          ['NUXT_OIDC_CLIENT_SECRET', 'Client secret for confidential clients.'],
          ['NUXT_OIDC_REDIRECT_URI', 'Optional callback override. Blank means {origin}/api/auth/oidc/callback.'],
          ['NUXT_OIDC_SCOPE', 'Requested scopes. Default is openid profile email groups.'],
          ['NUXT_OIDC_USERNAME_CLAIM', 'Claim used as DockHub username. Default is preferred_username.'],
          ['NUXT_OIDC_DISPLAY_NAME_CLAIM', 'Claim used as display name. Default is name.'],
          ['NUXT_OIDC_GROUPS_CLAIM', 'Claim that carries group names. Dot paths such as realm_access.roles are supported.'],
          ['NUXT_OIDC_ADMIN_GROUP', 'Group value mapped to the admin role.'],
          ['NUXT_OIDC_OPERATOR_GROUP', 'Group value mapped to the operator role.'],
          ['NUXT_OIDC_PROVIDER_NAME', 'Login button label, for example Keycloak, Authentik, or Company SSO.']
        ] as [string, string][],
        steps: [
          'Create an OIDC client in your identity provider.',
          'Register the DockHub callback URL exactly.',
          'Copy issuer, client ID, and client secret into Settings > Authentication.',
          'Expose group membership in an ID token or userinfo claim.',
          'Map provider groups to admin and operator roles, then test with one user from each role.'
        ],
        env: ['NUXT_OIDC_ENABLED', 'NUXT_OIDC_ISSUER', 'NUXT_OIDC_CLIENT_ID', 'NUXT_OIDC_CLIENT_SECRET', 'NUXT_OIDC_REDIRECT_URI', 'NUXT_OIDC_SCOPE', 'NUXT_OIDC_USERNAME_CLAIM', 'NUXT_OIDC_DISPLAY_NAME_CLAIM', 'NUXT_OIDC_GROUPS_CLAIM', 'NUXT_OIDC_ADMIN_GROUP', 'NUXT_OIDC_OPERATOR_GROUP', 'NUXT_OIDC_PROVIDER_NAME']
      },
      {
        id: 'keycloak',
        title: 'OIDC: Keycloak',
        icon: 'i-lucide-landmark',
        summary: 'Use a confidential OpenID Connect client in a realm dedicated to infrastructure access.',
        options: [
          ['Issuer', 'https://keycloak.example.com/realms/infrastructure'],
          ['Client ID', 'dockhub'],
          ['Redirect URI', 'https://dockhub.example.com/api/auth/oidc/callback'],
          ['Scope', 'openid profile email groups'],
          ['Groups claim', 'groups from a Group Membership mapper.'],
          ['Role groups', 'swarm-admins and swarm-operators, or your own group names.']
        ] as [string, string][],
        steps: [
          'Create or choose a realm, for example infrastructure.',
          'Create an OpenID Connect client with Client ID dockhub.',
          'Enable client authentication so Keycloak issues a client secret.',
          'Keep standard authorization code flow enabled.',
          'Add the exact DockHub callback URL as a valid redirect URI and the DockHub origin as a web origin.',
          'Add a Group Membership mapper with token claim name groups.',
          'Copy the realm issuer, client ID, and secret into DockHub.'
        ],
        env: ['NUXT_OIDC_ISSUER', 'NUXT_OIDC_CLIENT_ID', 'NUXT_OIDC_CLIENT_SECRET', 'NUXT_OIDC_GROUPS_CLAIM', 'NUXT_OIDC_ADMIN_GROUP', 'NUXT_OIDC_OPERATOR_GROUP']
      },
      {
        id: 'authentik',
        title: 'OIDC: Authentik',
        icon: 'i-lucide-fingerprint',
        summary: 'Create an Authentik application with an OAuth2/OpenID provider, then use the provider issuer and client credentials in DockHub.',
        options: [
          ['Issuer', 'Default per-provider issuer such as https://authentik.example.com/application/o/dockhub/.'],
          ['Client type', 'Confidential client with a client ID and client secret.'],
          ['Redirect URI', 'https://dockhub.example.com/api/auth/oidc/callback as an authorization redirect URI.'],
          ['Scope', 'openid profile email groups.'],
          ['Groups claim', 'groups, or a custom property mapping that returns group names.'],
          ['Provider name', 'Authentik or your organization SSO label.']
        ] as [string, string][],
        steps: [
          'Create a new Application in Authentik, for example DockHub.',
          'Create or attach an OAuth2/OpenID provider.',
          'Set the redirect URI to the exact DockHub callback URL.',
          'Use the default per-provider issuer mode unless your environment requires a global issuer.',
          'Copy the provider client ID, client secret, and issuer URL into DockHub.',
          'Make sure the selected scopes or property mappings include username, email, display name, and groups.'
        ],
        env: ['NUXT_OIDC_ISSUER', 'NUXT_OIDC_CLIENT_ID', 'NUXT_OIDC_CLIENT_SECRET', 'NUXT_OIDC_SCOPE', 'NUXT_OIDC_GROUPS_CLAIM', 'NUXT_OIDC_PROVIDER_NAME']
      },
      {
        id: 'generic-oidc',
        title: 'OIDC: Other providers',
        icon: 'i-lucide-circle-ellipsis',
        summary: 'Most standards-based OIDC providers work when they support discovery, authorization code flow, PKCE, and a usable groups claim.',
        options: [
          ['Discovery', 'The issuer must expose /.well-known/openid-configuration with authorization, token, and JWKS endpoints.'],
          ['Callback', 'The provider must allow the exact DockHub callback URL.'],
          ['Claims', 'Use preferred_username/name/groups when available, or adjust the claim fields in Settings.'],
          ['Groups', 'If groups are nested, set a dot path such as realm_access.roles.'],
          ['Userinfo fallback', 'DockHub checks userinfo when the ID token does not include the configured groups claim.']
        ] as [string, string][],
        steps: [
          'Create a web or confidential OIDC application.',
          'Enable authorization code flow and PKCE when the provider asks.',
          'Register the callback URL shown in DockHub Settings.',
          'Request openid profile email groups or the provider equivalent.',
          'Test with a user that should be viewer, operator, and admin.'
        ],
        env: ['NUXT_OIDC_ISSUER', 'NUXT_OIDC_SCOPE', 'NUXT_OIDC_USERNAME_CLAIM', 'NUXT_OIDC_DISPLAY_NAME_CLAIM', 'NUXT_OIDC_GROUPS_CLAIM']
      },
      {
        id: 'ldap-config',
        title: 'LDAP / Active Directory',
        icon: 'i-lucide-building-2',
        summary: 'LDAP login binds with a service account, searches for the user, verifies the password as that user, then maps memberOf groups to DockHub roles.',
        options: [
          ['NUXT_LDAP_ENABLED', 'Turns LDAP login on by default. UI overrides can also enable or disable it.'],
          ['NUXT_LDAP_URL', 'Directory URL such as ldaps://ldap.example.com:636.'],
          ['NUXT_LDAP_BIND_DN', 'Service account DN used to search for users.'],
          ['NUXT_LDAP_BIND_CREDENTIALS', 'Service account password.'],
          ['NUXT_LDAP_SEARCH_BASE', 'Base DN for user lookups.'],
          ['NUXT_LDAP_SEARCH_FILTER', 'Search filter with {{username}}, for example (uid={{username}}).'],
          ['NUXT_LDAP_GROUP_SEARCH_BASE', 'Optional group search base for future group lookup expansion.'],
          ['NUXT_LDAP_GROUP_SEARCH_FILTER', 'Optional group filter. Default is (member={{dn}}).'],
          ['NUXT_LDAP_ADMIN_GROUP', 'Admin group DN or matching string.'],
          ['NUXT_LDAP_OPERATOR_GROUP', 'Operator group DN or matching string.']
        ] as [string, string][],
        steps: [
          'Use LDAPS when possible and confirm DockHub can reach the directory.',
          'Create a least-privilege bind account that can search users and read group membership.',
          'Set the user search base and filter.',
          'Map admin and operator group DNs to DockHub roles.',
          'Test one user from each expected role and one user with no mapped group.'
        ],
        env: ['NUXT_LDAP_ENABLED', 'NUXT_LDAP_URL', 'NUXT_LDAP_BIND_DN', 'NUXT_LDAP_BIND_CREDENTIALS', 'NUXT_LDAP_SEARCH_BASE', 'NUXT_LDAP_SEARCH_FILTER', 'NUXT_LDAP_GROUP_SEARCH_BASE', 'NUXT_LDAP_GROUP_SEARCH_FILTER', 'NUXT_LDAP_ADMIN_GROUP', 'NUXT_LDAP_OPERATOR_GROUP']
      }
    ]
  }
]

const keycloakKeyValues: [string, string][] = [
  ['Realm', 'infrastructure'],
  ['Client ID', 'dockhub'],
  ['Client auth', 'On'],
  ['Redirect URI', 'https://dockhub.example.com/api/auth/oidc/callback'],
  ['Web origin', 'https://dockhub.example.com']
]

const dockhubOidcValues: [string, string][] = [
  ['Provider label', 'Keycloak'],
  ['Issuer URL', 'https://keycloak.example.com/realms/infrastructure'],
  ['Client ID', 'dockhub'],
  ['Scope', 'openid profile email groups'],
  ['Groups claim', 'groups'],
  ['Admin group', 'swarm-admins'],
  ['Operator group', 'swarm-operators']
]

const authentikValues: [string, string][] = [
  ['Application', 'DockHub'],
  ['Provider', 'OAuth2/OpenID'],
  ['Issuer mode', 'Per-provider'],
  ['Issuer URL', 'https://authentik.example.com/application/o/dockhub/'],
  ['Redirect URI', 'https://dockhub.example.com/api/auth/oidc/callback']
]

const keycloakSteps = [
  { title: '1. Create or choose a realm', body: 'Use a realm dedicated to infrastructure access, for example infrastructure. The DockHub issuer URL will end with /realms/infrastructure.' },
  { title: '2. Create an OpenID Connect client', body: 'In Clients, create a client with Client ID dockhub and Client type OpenID Connect. Use a confidential client by enabling client authentication.' },
  { title: '3. Configure login settings', body: 'Keep the standard authorization code flow enabled. Add the DockHub callback URL as a valid redirect URI and add the DockHub origin as a web origin.' },
  { title: '4. Copy the client secret', body: 'Open the client Credentials tab and copy the generated secret into DockHub. Rotate it if it was exposed.' },
  { title: '5. Add groups and memberships', body: 'Create groups such as swarm-admins and swarm-operators. Add users to the group that matches their DockHub role.' },
  { title: '6. Add a groups claim mapper', body: 'In the client dedicated scope or a client scope assigned to DockHub, add a Group Membership mapper with token claim name groups. Include it in the ID token or userinfo response.' }
]

const dockhubSteps = [
  { title: '1. Open Settings > Authentication', body: 'Enable OIDC single sign-on and keep local admin access available until SSO is tested.' },
  { title: '2. Paste provider values', body: 'Use the issuer URL, client ID, and client secret from the provider. Do not include the /.well-known/openid-configuration suffix.' },
  { title: '3. Confirm callback URL', body: 'Leave Redirect URI blank when the shown effective URL is the public URL users reach. Set it explicitly when DockHub is behind a proxy.' },
  { title: '4. Map claims and groups', body: 'Use preferred_username for username, name for display name, groups for groups claim, and the same group values you configured at the provider.' },
  { title: '5. Save and test', body: 'Click Save OIDC, sign out, and test the SSO login button. Verify the synced user has the expected role in Users.' }
]

const authentikSteps = [
  { title: '1. Create application and provider', body: 'In Authentik, create an Application named DockHub and attach an OAuth2/OpenID provider.' },
  { title: '2. Configure redirect URI', body: 'Add the DockHub callback URL as an authorization redirect URI. It must match the effective redirect URI shown in DockHub.' },
  { title: '3. Keep per-provider issuer mode', body: 'The default per-provider issuer produces an issuer like https://authentik.example.com/application/o/dockhub/. Copy that value into DockHub.' },
  { title: '4. Confirm scopes and claims', body: 'Allow openid, profile, email, and groups, or add property mappings that expose equivalent username, display name, email, and groups claims.' },
  { title: '5. Save and test', body: 'Set provider label to Authentik, save OIDC, then test login with users from admin, operator, and viewer paths.' }
]

const troubleshooting: [string, string][] = [
  ['Invalid redirect_uri', 'The provider redirect URI must exactly match DockHub effective redirect URI, including scheme, host, path, and port.'],
  ['OIDC discovery failed', 'Use the issuer URL only, not the /.well-known/openid-configuration URL. Confirm DockHub can reach the provider from the server.'],
  ['User logs in as viewer', 'The groups claim did not match admin/operator values, or the provider did not include groups in ID token/userinfo.'],
  ['Client authentication failed', 'Check the client secret and confirm the provider client is configured as confidential when a secret is required.'],
  ['Works locally but not through proxy', 'Set NUXT_OIDC_REDIRECT_URI or the UI Redirect URI to the external HTTPS callback URL.']
]

// ── Sidebar navigation config ─────────────────────────────────────────────────
const navConfig = [
  {
    id: 'home',
    label: 'Overview',
    icon: 'i-lucide-layout-dashboard',
    subs: [] as { id: string; label: string; icon: string }[]
  },
  {
    id: 'manual',
    label: 'User Manual',
    icon: 'i-lucide-book-open',
    subs: [
      { id: 'dashboard',        label: 'Dashboard',          icon: 'i-lucide-radar' },
      { id: 'stacks',           label: 'Stacks',             icon: 'i-lucide-layers' },
      { id: 'services',         label: 'Services',           icon: 'i-lucide-boxes' },
      { id: 'tasks-containers', label: 'Tasks & Containers', icon: 'i-lucide-list-checks' },
      { id: 'nodes',            label: 'Nodes',              icon: 'i-lucide-server' },
      { id: 'networks-volumes', label: 'Networks & Volumes', icon: 'i-lucide-network' },
      { id: 'secrets-configs',  label: 'Secrets & Configs',  icon: 'i-lucide-key-round' },
      { id: 'registries',       label: 'Registries',         icon: 'i-lucide-package' },
      { id: 'users-audit',      label: 'Users & Audit',      icon: 'i-lucide-users' },
      { id: 'settings',         label: 'Settings',           icon: 'i-lucide-settings' },
      { id: 'workflows',        label: 'Common Workflows',   icon: 'i-lucide-route' }
    ]
  },
  {
    id: 'configuration',
    label: 'Configuration',
    icon: 'i-lucide-sliders-horizontal',
    subs: [
      { id: 'runtime-config',  label: 'Runtime Config',    icon: 'i-lucide-sliders-horizontal' },
      { id: 'docker-config',   label: 'Docker Engine',     icon: 'i-lucide-container' },
      { id: 'gitlab-config',   label: 'GitLab Versioning', icon: 'i-lucide-git-branch' },
      { id: 'local-auth',      label: 'Local Accounts',    icon: 'i-lucide-user-round-cog' },
      { id: 'oidc-config',     label: 'OIDC SSO',          icon: 'i-lucide-key-round' },
      { id: 'keycloak',        label: 'Keycloak',          icon: 'i-lucide-landmark' },
      { id: 'authentik',       label: 'Authentik',         icon: 'i-lucide-fingerprint' },
      { id: 'generic-oidc',    label: 'Other Providers',   icon: 'i-lucide-circle-ellipsis' },
      { id: 'ldap-config',     label: 'LDAP / AD',         icon: 'i-lucide-building-2' },
      { id: 'provider-guides', label: 'Provider Guides',   icon: 'i-lucide-anchor' }
    ]
  },
  {
    id: 'api',
    label: 'API Reference',
    icon: 'i-lucide-braces',
    subs: [] as { id: string; label: string; icon: string }[]
  }
]

// ── Page state ────────────────────────────────────────────────────────────────
const runtimeConfig = useRuntimeConfig()
const isStaticDocs = runtimeConfig.public.staticDocs as boolean

const activeSection = ref('home')
const mainRef = ref<HTMLElement | null>(null)
const mobileOpen = ref(false)
const apiEverLoaded = ref(false)

function goTo(section: string, anchor?: string) {
  activeSection.value = section
  mobileOpen.value = false
  if (section === 'api') apiEverLoaded.value = true
  nextTick(() => {
    if (anchor) {
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      mainRef.value?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }
  })
}

onMounted(() => {
  const hash = window.location.hash.replace('#', '')
  if (['home', 'manual', 'configuration', 'api'].includes(hash)) {
    activeSection.value = hash
    if (hash === 'api') apiEverLoaded.value = true
  }
})

watch(activeSection, (val) => {
  const base = window.location.pathname + window.location.search
  history.replaceState(null, '', val === 'home' ? base : `${base}#${val}`)
})
</script>

<template>
  <div class="docs-root">
    <!-- ── Header ──────────────────────────────────────────────────────────── -->
    <header class="docs-header">
      <div class="docs-header-inner">
        <div class="flex items-center gap-2 min-w-0">
          <button
            class="flex lg:hidden size-8 items-center justify-center rounded-md text-faint hover:text-foam hover:bg-surface-2 transition-colors"
            @click="mobileOpen = !mobileOpen"
            aria-label="Toggle navigation"
          >
            <UIcon name="i-lucide-menu" class="size-4" />
          </button>
          <NuxtLink to="/" class="flex items-center gap-2 shrink-0 group">
            <DockHubLogo variant="icon" class="size-7 transition-opacity group-hover:opacity-80 drop-shadow-[0_4px_12px_rgba(36,150,237,0.3)]" />
            <span class="font-display text-sm font-bold text-foam hidden sm:inline">DockHub</span>
          </NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="size-3.5 text-faint hidden sm:block shrink-0" />
          <span class="text-sm font-medium text-muted truncate">Documentation</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <ThemeModeControl compact />
          <NuxtLink
            to="/"
            class="hidden sm:flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foam px-3 py-1.5 rounded-md border border-hull hover:border-beacon/40 hover:bg-surface-2 transition-all"
          >
            <UIcon name="i-lucide-arrow-left" class="size-3.5" />
            Open App
          </NuxtLink>
        </div>
      </div>
    </header>

    <!-- ── Body ────────────────────────────────────────────────────────────── -->
    <div class="docs-body">
      <!-- Mobile drawer -->
      <USlideover
        v-model:open="mobileOpen"
        side="left"
        :ui="{ content: 'w-[220px] bg-abyss border-r border-hull-soft' }"
      >
        <template #content>
          <DocsSidebar
            :nav-config="navConfig"
            :active-section="activeSection"
            @navigate="goTo"
          />
        </template>
      </USlideover>

      <!-- Desktop sidebar -->
      <aside class="docs-sidebar hidden lg:block">
        <DocsSidebar
          :nav-config="navConfig"
          :active-section="activeSection"
          @navigate="goTo"
        />
      </aside>

      <!-- Main scrollable content -->
      <main
        ref="mainRef"
        :class="['docs-main', activeSection === 'api' && 'docs-main--api']"
      >
        <!-- ── HOME ──────────────────────────────────────────────────────── -->
        <div v-show="activeSection === 'home'" class="section-wrap section-wrap--home">
          <!-- Hero -->
          <div class="home-hero">
            <div class="home-hero-glow" />
            <div class="relative z-10">
              <div class="flex items-start gap-4 mb-5">
                <div class="flex items-center justify-center size-14 rounded-2xl bg-beacon/15 ring-2 ring-beacon/30 shrink-0">
                  <DockHubLogo variant="icon" class="size-9" />
                </div>
                <div>
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-bold uppercase tracking-widest text-beacon">DockHub</span>
                    <span class="rounded-full bg-beacon/10 px-2 py-0.5 text-[10px] font-semibold text-beacon ring-1 ring-beacon/25">v1.0</span>
                  </div>
                  <h1 class="font-display text-2xl font-bold text-foam leading-tight">Documentation</h1>
                  <p class="mt-2 text-sm text-muted max-w-xl leading-relaxed">
                    The self-hosted Docker Swarm management console. Deploy stacks, monitor services, manage infrastructure, and control access — all from a single web interface.
                  </p>
                </div>
              </div>
              <div class="flex flex-wrap gap-2.5 mt-4">
                <button
                  v-for="card in homeNavCards"
                  :key="card.id"
                  class="home-hero-btn group"
                  @click="goTo(card.id)"
                >
                  <UIcon :name="card.icon" class="size-3.5 text-beacon" />
                  {{ card.label }}
                  <UIcon name="i-lucide-arrow-right" class="size-3 text-faint group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </div>

          <!-- Features -->
          <div class="mt-10">
            <p class="section-eyebrow">Core capabilities</p>
            <h2 class="section-title">What DockHub does</h2>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
              <div v-for="f in appFeatures" :key="f.title" class="feature-card">
                <span class="flex size-8 items-center justify-center rounded-lg bg-surface-2 ring-1 ring-hull mb-3">
                  <UIcon :name="f.icon" class="size-4 text-beacon" />
                </span>
                <h3 class="font-display text-sm font-semibold text-foam">{{ f.title }}</h3>
                <p class="mt-1 text-xs text-muted leading-relaxed">{{ f.desc }}</p>
              </div>
            </div>
          </div>

          <!-- Tech stack + roles -->
          <div class="mt-10 grid gap-6 lg:grid-cols-2">
            <div>
              <p class="section-eyebrow">Architecture</p>
              <h2 class="section-title">Technology stack</h2>
              <div class="mt-4 space-y-1.5">
                <div
                  v-for="[label, value] in techStack"
                  :key="label"
                  class="flex items-start gap-3 rounded-lg border border-hull-soft bg-surface px-3 py-2.5"
                >
                  <span class="shrink-0 text-xs text-faint w-20">{{ label }}</span>
                  <span class="text-xs font-mono text-foam">{{ value }}</span>
                </div>
              </div>
            </div>

            <div>
              <p class="section-eyebrow">Access model</p>
              <h2 class="section-title">Role-based access</h2>
              <div class="mt-4 space-y-3">
                <div v-for="role in roles" :key="role.name" class="rounded-lg border border-hull bg-surface p-3.5">
                  <div class="flex items-center gap-2 mb-2">
                    <span :class="['flex size-6 items-center justify-center rounded ring-1', role.bg]">
                      <UIcon :name="role.icon" :class="['size-3.5', role.color]" />
                    </span>
                    <span :class="['text-sm font-semibold font-display', role.color]">{{ role.name }}</span>
                  </div>
                  <ul class="grid grid-cols-2 gap-x-3 gap-y-1">
                    <li v-for="perm in role.perms" :key="perm" class="flex items-center gap-1.5 text-xs text-muted">
                      <UIcon name="i-lucide-check" class="size-3 text-running shrink-0" />
                      {{ perm }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick start -->
          <div class="mt-10">
            <p class="section-eyebrow">Getting started</p>
            <h2 class="section-title">Quick start</h2>
            <div class="grid gap-3 sm:grid-cols-2 mt-4">
              <div v-for="step in quickStart" :key="step.n" class="rounded-lg border border-hull bg-surface overflow-hidden">
                <div class="flex items-center gap-2.5 px-4 py-2.5 border-b border-hull-soft bg-surface-2">
                  <span class="flex size-5 items-center justify-center rounded-full bg-beacon/15 text-[10px] font-bold text-beacon ring-1 ring-beacon/25">
                    {{ step.n }}
                  </span>
                  <span class="text-xs font-semibold text-foam">{{ step.title }}</span>
                </div>
                <pre class="px-4 py-3 text-xs font-mono text-muted whitespace-pre-wrap leading-relaxed">{{ step.code }}</pre>
              </div>
            </div>
          </div>

          <!-- Nav cards -->
          <div class="mt-10">
            <p class="section-eyebrow">Documentation sections</p>
            <h2 class="section-title">Explore the docs</h2>
            <div class="grid gap-4 sm:grid-cols-3 mt-4">
              <button
                v-for="card in homeNavCards"
                :key="card.id"
                class="doc-nav-card group"
                @click="goTo(card.id)"
              >
                <span class="flex size-10 items-center justify-center rounded-lg bg-abyss ring-1 ring-hull mb-3">
                  <UIcon :name="card.icon" class="size-5 text-beacon" />
                </span>
                <div class="flex items-start justify-between gap-2">
                  <h3 class="font-display text-base font-semibold text-foam">{{ card.label }}</h3>
                  <UIcon name="i-lucide-arrow-right" class="size-4 text-faint mt-0.5 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </div>
                <p class="mt-1.5 text-xs text-muted leading-relaxed">{{ card.desc }}</p>
              </button>
            </div>
          </div>

          <!-- Footer -->
          <footer class="doc-footer">
            <div class="doc-footer-inner">
              <div class="flex items-center gap-2">
                <DockHubLogo variant="icon" class="size-5 opacity-50" />
                <span class="text-xs text-faint">DockHub — Docker Swarm Management Console</span>
              </div>
              <p class="text-xs text-faint">
                Made with <span class="text-running mx-0.5">&#9829;</span> by
                <a href="https://github.com/sengphirum" target="_blank" rel="noopener noreferrer" class="font-semibold text-beacon hover:text-foam transition-colors ml-0.5">
                  Seng Phirum
                </a>
              </p>
            </div>
          </footer>
        </div>

        <!-- ── USER MANUAL ──────────────────────────────────────────────── -->
        <div v-show="activeSection === 'manual'" class="section-wrap">
          <div class="mb-8">
            <p class="section-eyebrow">Guides</p>
            <h1 class="section-h1">User Manual</h1>
            <p class="mt-2 text-sm text-muted max-w-2xl">Feature usage, daily operational workflows, and guidance for every DockHub page.</p>
          </div>

          <div class="space-y-10">
            <section class="space-y-4">
              <p class="section-eyebrow">Feature usage</p>
              <h2 class="section-title">Daily operation guide</h2>

              <div class="grid gap-6">
                <article
                  v-for="feature in featureGuides"
                  :id="feature.id"
                  :key="feature.id"
                  class="grid gap-4 scroll-mt-20 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,25rem)] lg:items-start"
                >
                  <div class="space-y-3">
                    <div class="flex items-center gap-2">
                      <span class="flex size-9 items-center justify-center rounded-lg bg-surface-2 ring-1 ring-hull">
                        <UIcon :name="feature.icon" class="size-4 text-beacon" />
                      </span>
                      <h3 class="font-display text-xl font-semibold text-foam">{{ feature.title }}</h3>
                    </div>
                    <p class="text-sm text-muted">{{ feature.summary }}</p>
                    <ol class="space-y-2 text-sm text-muted">
                      <li v-for="(step, i) in feature.steps" :key="step" class="flex gap-2">
                        <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-beacon">
                          {{ i + 1 }}
                        </span>
                        <span>{{ step }}</span>
                      </li>
                    </ol>
                  </div>

                  <figure class="doc-shot">
                    <div class="shot-toolbar">
                      <span /><span /><span />
                      <p>{{ feature.shot.label }}</p>
                    </div>
                    <div class="shot-body">
                      <div class="flex items-center justify-between gap-3">
                        <p class="font-display text-sm font-semibold text-foam">{{ feature.shot.label }}</p>
                        <span class="rounded-md bg-running/10 px-2 py-1 text-xs font-medium text-running">{{ feature.shot.status }}</span>
                      </div>
                      <div class="mt-3 grid grid-cols-2 gap-2">
                        <div v-for="[lbl, val] in feature.shot.metrics" :key="lbl" class="shot-metric">
                          <p>{{ lbl }}</p>
                          <strong>{{ val }}</strong>
                        </div>
                      </div>
                      <div class="mt-3 space-y-1.5">
                        <div v-for="[a, b, c] in feature.shot.rows" :key="`${a}-${b}`" class="shot-row">
                          <span class="truncate font-medium text-foam">{{ a }}</span>
                          <span class="truncate text-faint">{{ b }}</span>
                          <span class="justify-self-end rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{{ c }}</span>
                        </div>
                      </div>
                    </div>
                  </figure>
                </article>
              </div>
            </section>

            <section id="workflows" class="space-y-4 scroll-mt-20">
              <p class="section-eyebrow">Common workflows</p>
              <h2 class="section-title">How to combine the pages</h2>
              <div class="grid gap-4 lg:grid-cols-3">
                <article v-for="wf in workflows" :key="wf.title" class="rounded-lg border border-hull bg-surface p-5">
                  <div class="flex items-center gap-2 mb-4">
                    <UIcon :name="wf.icon" class="size-4 text-beacon" />
                    <h3 class="font-display text-lg font-semibold text-foam">{{ wf.title }}</h3>
                  </div>
                  <ol class="space-y-2 text-sm text-muted">
                    <li v-for="(step, i) in wf.steps" :key="step" class="flex gap-2">
                      <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-beacon">{{ i + 1 }}</span>
                      <span>{{ step }}</span>
                    </li>
                  </ol>
                </article>
              </div>
            </section>
          </div>

          <footer class="doc-footer">
            <div class="doc-footer-inner">
              <div class="flex items-center gap-2">
                <DockHubLogo variant="icon" class="size-5 opacity-50" />
                <span class="text-xs text-faint">DockHub — Docker Swarm Management Console</span>
              </div>
              <p class="text-xs text-faint">
                Made with <span class="text-running mx-0.5">&#9829;</span> by
                <a href="https://github.com/sengphirum" target="_blank" rel="noopener noreferrer" class="font-semibold text-beacon hover:text-foam transition-colors ml-0.5">Seng Phirum</a>
              </p>
            </div>
          </footer>
        </div>

        <!-- ── CONFIGURATION ────────────────────────────────────────────── -->
        <div v-show="activeSection === 'configuration'" class="section-wrap">
          <div class="mb-8">
            <p class="section-eyebrow">Reference</p>
            <h1 class="section-h1">Configuration</h1>
            <p class="mt-2 text-sm text-muted max-w-2xl">System options, integrations, authentication providers, and setup guides.</p>
          </div>

          <div class="space-y-10">
            <section
              v-for="section in configurationSections"
              :id="section.id"
              :key="section.id"
              class="space-y-4 scroll-mt-20"
            >
              <div>
                <p class="section-eyebrow">{{ section.eyebrow }}</p>
                <h2 class="section-title">{{ section.title }}</h2>
                <p class="mt-2 max-w-3xl text-sm text-muted">{{ section.summary }}</p>
              </div>

              <div class="grid gap-4">
                <article
                  v-for="guide in section.guides"
                  :id="guide.id"
                  :key="guide.id"
                  class="scroll-mt-20 rounded-lg border border-hull bg-surface p-5"
                >
                  <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
                    <div>
                      <div class="flex items-center gap-2 mb-2">
                        <UIcon :name="guide.icon" class="size-4 text-beacon" />
                        <h3 class="font-display text-lg font-semibold text-foam">{{ guide.title }}</h3>
                      </div>
                      <p class="text-sm text-muted">{{ guide.summary }}</p>
                      <div class="mt-4 space-y-2">
                        <div v-for="[name, desc] in guide.options" :key="name" class="option-row">
                          <code>{{ name }}</code>
                          <p>{{ desc }}</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p class="mb-2 text-xs font-semibold uppercase tracking-widest text-faint">Setup checklist</p>
                      <ol class="space-y-2 text-sm text-muted">
                        <li v-for="(step, i) in guide.steps" :key="step" class="flex gap-2">
                          <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-beacon">{{ i + 1 }}</span>
                          <span>{{ step }}</span>
                        </li>
                      </ol>
                      <p class="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-faint">Related env vars</p>
                      <div class="flex flex-wrap gap-2">
                        <code v-for="key in guide.env" :key="key" class="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs text-beacon ring-1 ring-hull">
                          {{ key }}
                        </code>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <!-- Provider guides -->
            <section id="provider-guides" class="space-y-5 scroll-mt-20">
              <div>
                <p class="section-eyebrow">OIDC provider guide</p>
                <h2 class="section-title">Keycloak and Authentik setup details</h2>
                <p class="mt-2 max-w-3xl text-sm text-muted">
                  DockHub validates ID tokens using the provider discovery document and JWKS, then maps the configured groups claim to viewer, operator, or admin.
                </p>
              </div>

              <div class="grid gap-5 lg:grid-cols-2">
                <article class="space-y-4">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-landmark" class="size-4 text-beacon" />
                    <h3 class="font-display text-lg font-semibold text-foam">Keycloak side</h3>
                  </div>
                  <ol class="space-y-3 text-sm text-muted">
                    <li v-for="step in keycloakSteps" :key="step.title">
                      <p class="font-medium text-foam">{{ step.title }}</p>
                      <p class="mt-1">{{ step.body }}</p>
                    </li>
                  </ol>
                </article>
                <figure class="doc-shot">
                  <div class="shot-toolbar"><span /><span /><span /><p>Keycloak client settings</p></div>
                  <div class="shot-body">
                    <div class="rounded-lg border border-hull bg-abyss p-3">
                      <p class="text-sm font-semibold text-foam">Client details</p>
                      <div class="mt-3 space-y-2">
                        <div v-for="[lbl, val] in keycloakKeyValues" :key="lbl" class="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-xs">
                          <span class="text-faint">{{ lbl }}</span>
                          <span class="truncate font-mono text-muted">{{ val }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="mt-3 rounded-lg border border-hull bg-abyss p-3">
                      <p class="text-sm font-semibold text-foam">Groups mapper</p>
                      <div class="mt-3 grid gap-2 text-xs">
                        <div class="shot-row"><span>Mapper type</span><span>Group Membership</span><span class="justify-self-end text-running">On</span></div>
                        <div class="shot-row"><span>Token claim</span><span class="font-mono">groups</span><span class="justify-self-end text-running">ID token</span></div>
                      </div>
                    </div>
                  </div>
                </figure>
              </div>

              <div class="grid gap-5 lg:grid-cols-2">
                <article class="space-y-4">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-fingerprint" class="size-4 text-beacon" />
                    <h3 class="font-display text-lg font-semibold text-foam">Authentik side</h3>
                  </div>
                  <ol class="space-y-3 text-sm text-muted">
                    <li v-for="step in authentikSteps" :key="step.title">
                      <p class="font-medium text-foam">{{ step.title }}</p>
                      <p class="mt-1">{{ step.body }}</p>
                    </li>
                  </ol>
                </article>
                <figure class="doc-shot">
                  <div class="shot-toolbar"><span /><span /><span /><p>Authentik provider settings</p></div>
                  <div class="shot-body">
                    <div class="rounded-lg border border-hull bg-abyss p-3">
                      <p class="text-sm font-semibold text-foam">Application provider</p>
                      <div class="mt-3 space-y-2">
                        <div v-for="[lbl, val] in authentikValues" :key="lbl" class="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-xs">
                          <span class="text-faint">{{ lbl }}</span>
                          <span class="truncate font-mono text-muted">{{ val }}</span>
                        </div>
                      </div>
                    </div>
                    <div class="mt-3 rounded-lg bg-beacon/10 px-3 py-2 text-xs text-beacon ring-1 ring-beacon/20">
                      In DockHub, use the issuer value only. The discovery path is added automatically.
                    </div>
                  </div>
                </figure>
              </div>

              <div class="grid gap-5 lg:grid-cols-2">
                <article class="space-y-4">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-anchor" class="size-4 text-beacon" />
                    <h3 class="font-display text-lg font-semibold text-foam">DockHub side</h3>
                  </div>
                  <ol class="space-y-3 text-sm text-muted">
                    <li v-for="step in dockhubSteps" :key="step.title">
                      <p class="font-medium text-foam">{{ step.title }}</p>
                      <p class="mt-1">{{ step.body }}</p>
                    </li>
                  </ol>
                </article>
                <figure class="doc-shot">
                  <div class="shot-toolbar"><span /><span /><span /><p>DockHub OIDC settings</p></div>
                  <div class="shot-body">
                    <div class="flex items-center justify-between">
                      <p class="text-sm font-semibold text-foam">OIDC single sign-on</p>
                      <span class="rounded-md bg-running/10 px-2 py-1 text-xs font-medium text-running">Enabled</span>
                    </div>
                    <div class="mt-3 space-y-2">
                      <div v-for="[lbl, val] in dockhubOidcValues" :key="lbl" class="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-xs">
                        <span class="text-faint">{{ lbl }}</span>
                        <span class="truncate font-mono text-muted">{{ val }}</span>
                      </div>
                    </div>
                    <div class="mt-3 rounded-lg bg-beacon/10 px-3 py-2 text-xs text-beacon ring-1 ring-beacon/20">
                      Save OIDC, sign out, then test the SSO login button.
                    </div>
                  </div>
                </figure>
              </div>

              <article class="rounded-lg border border-hull bg-surface p-5">
                <div class="flex items-center gap-2 mb-4">
                  <UIcon name="i-lucide-stethoscope" class="size-4 text-beacon" />
                  <h3 class="font-display text-lg font-semibold text-foam">Authentication troubleshooting</h3>
                </div>
                <div class="grid gap-3 md:grid-cols-2">
                  <div v-for="[problem, fix] in troubleshooting" :key="problem" class="rounded-lg bg-surface-2 p-3 ring-1 ring-hull">
                    <p class="text-sm font-medium text-foam">{{ problem }}</p>
                    <p class="mt-1 text-xs text-muted">{{ fix }}</p>
                  </div>
                </div>
              </article>

              <div class="rounded-lg border border-hull bg-abyss p-4">
                <p class="text-sm font-medium text-foam mb-2">Reference links</p>
                <div class="flex flex-wrap gap-2">
                  <UButton to="https://www.keycloak.org/docs/latest/server_admin/index.html" target="_blank" color="neutral" variant="soft" icon="i-lucide-external-link" label="Keycloak Server Administration" />
                  <UButton to="https://www.keycloak.org/securing-apps/oidc-layers" target="_blank" color="neutral" variant="soft" icon="i-lucide-external-link" label="Keycloak OIDC endpoints" />
                  <UButton to="https://docs.goauthentik.io/add-secure-apps/providers/oauth2/" target="_blank" color="neutral" variant="soft" icon="i-lucide-external-link" label="Authentik OAuth2 provider" />
                </div>
              </div>
            </section>
          </div>

          <footer class="doc-footer">
            <div class="doc-footer-inner">
              <div class="flex items-center gap-2">
                <DockHubLogo variant="icon" class="size-5 opacity-50" />
                <span class="text-xs text-faint">DockHub — Docker Swarm Management Console</span>
              </div>
              <p class="text-xs text-faint">
                Made with <span class="text-running mx-0.5">&#9829;</span> by
                <a href="https://github.com/sengphirum" target="_blank" rel="noopener noreferrer" class="font-semibold text-beacon hover:text-foam transition-colors ml-0.5">Seng Phirum</a>
              </p>
            </div>
          </footer>
        </div>

        <!-- ── API REFERENCE ────────────────────────────────────────────── -->
        <div v-show="activeSection === 'api'" class="api-wrapper">
          <!-- Static docs build: live iframe unavailable -->
          <div v-if="isStaticDocs" class="api-static-placeholder">
            <span class="flex size-14 items-center justify-center rounded-2xl bg-surface-2 ring-1 ring-hull mb-5">
              <UIcon name="i-lucide-braces" class="size-7 text-beacon" />
            </span>
            <h2 class="font-display text-xl font-semibold text-foam mb-2">API Reference</h2>
            <p class="text-sm text-muted max-w-sm text-center leading-relaxed mb-6">
              The interactive Swagger UI is served by the live DockHub server and is not available in this static documentation build.
            </p>
            <div class="flex flex-wrap gap-3 justify-center">
              <div class="rounded-lg border border-hull bg-surface p-4 text-left max-w-xs">
                <p class="text-xs font-semibold text-foam mb-2">When DockHub is running</p>
                <p class="text-xs text-muted font-mono">http://your-server/api/swagger</p>
              </div>
            </div>
            <div class="mt-8 rounded-lg border border-hull bg-surface p-5 max-w-lg text-left">
              <div class="flex items-center gap-2 mb-3">
                <UIcon name="i-lucide-info" class="size-4 text-beacon shrink-0" />
                <p class="text-sm font-semibold text-foam">What the API covers</p>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div v-for="item in apiEndpointGroups" :key="item.tag" class="flex items-center gap-2 text-xs text-muted">
                  <UIcon :name="item.icon" class="size-3.5 text-faint shrink-0" />
                  {{ item.tag }}
                </div>
              </div>
            </div>
          </div>
          <!-- Live server: full Swagger iframe -->
          <iframe
            v-else-if="apiEverLoaded"
            src="/api/swagger"
            class="api-iframe"
            title="DockHub API Reference"
          />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ── Root layout ──────────────────────────────────────────────────────────── */
.docs-root {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--color-ink);
  color: var(--color-foam);
}

/* ── Sticky header ────────────────────────────────────────────────────────── */
.docs-header {
  position: sticky;
  top: 0;
  z-index: 30;
  height: 52px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-hull-soft);
  background: color-mix(in srgb, var(--color-ink) 85%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.docs-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 1rem;
  gap: 0.75rem;
}

/* ── Body: sidebar + main ─────────────────────────────────────────────────── */
.docs-body {
  display: flex;
  flex: 1;
  height: calc(100dvh - 52px);
  overflow: hidden;
}

.docs-sidebar {
  width: 220px;
  flex-shrink: 0;
  height: 100%;
  overflow-y: auto;
  border-right: 1px solid var(--color-hull-soft);
  background: var(--color-abyss);
  scrollbar-width: thin;
  scrollbar-color: var(--color-hull) transparent;
}

.docs-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-hull) transparent;
}

.docs-main--api {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── Section wrappers ─────────────────────────────────────────────────────── */
.section-wrap {
  padding: 2rem 1.5rem 2rem;
  width: 100%;
}

.section-wrap--home {
  max-width: 1100px;
}

@media (min-width: 768px) {
  .section-wrap { padding: 2.5rem 2.5rem 2.5rem; }
}

@media (min-width: 1280px) {
  .section-wrap { padding: 2.75rem 3rem 3rem; }
}

/* Slightly larger base prose text inside doc sections */
.section-wrap p,
.section-wrap li span,
.section-wrap ol li { font-size: 0.9375rem; }

/* ── API iframe ───────────────────────────────────────────────────────────── */
.api-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.api-iframe {
  flex: 1;
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  min-height: 500px;
}

/* ── Home hero ────────────────────────────────────────────────────────────── */
.home-hero {
  position: relative;
  padding: 1.75rem 2rem;
  border-radius: 1rem;
  border: 1px solid var(--color-hull);
  background: var(--color-surface);
  overflow: hidden;
}

.home-hero-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 60% 50% at 5% 30%, color-mix(in srgb, var(--color-beacon) 8%, transparent), transparent);
  pointer-events: none;
}

.home-hero-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.9rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-hull);
  background: var(--color-surface-2);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.home-hero-btn:hover {
  border-color: color-mix(in srgb, var(--color-beacon) 40%, transparent);
  color: var(--color-foam);
  background: color-mix(in srgb, var(--color-beacon) 8%, var(--color-surface-2));
}

/* ── Feature cards ────────────────────────────────────────────────────────── */
.feature-card {
  padding: 1.125rem;
  border-radius: 0.75rem;
  border: 1px solid var(--color-hull);
  background: var(--color-surface);
  transition: border-color 0.15s, background 0.15s;
}

.feature-card:hover {
  border-color: color-mix(in srgb, var(--color-beacon) 30%, transparent);
  background: var(--color-surface-2);
}

/* ── Doc nav cards ────────────────────────────────────────────────────────── */
.doc-nav-card {
  padding: 1.125rem;
  border-radius: 0.75rem;
  border: 1px solid var(--color-hull);
  background: var(--color-surface);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  width: 100%;
}

.doc-nav-card:hover {
  border-color: color-mix(in srgb, var(--color-beacon) 40%, transparent);
  background: var(--color-surface-2);
}

/* ── Typography helpers ───────────────────────────────────────────────────── */
.section-eyebrow {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-faint);
  margin-bottom: 0.125rem;
}

.section-title {
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 600;
  color: var(--color-foam);
}

.section-h1 {
  font-family: var(--font-display);
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--color-foam);
}

/* ── Config option rows ───────────────────────────────────────────────────── */
.option-row {
  display: grid;
  grid-template-columns: minmax(10rem, 16rem) minmax(0, 1fr);
  gap: 0.875rem;
  border: 1px solid var(--color-hull-soft);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--color-surface-2) 66%, transparent);
  padding: 0.7rem 0.8rem;
}

.option-row code {
  overflow-wrap: anywhere;
  color: var(--color-beacon);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}

.option-row p {
  color: var(--color-muted);
  font-size: 0.875rem;
}

@media (max-width: 640px) {
  .option-row { grid-template-columns: 1fr; }
}

/* ── Mockup shot figures ──────────────────────────────────────────────────── */
.doc-shot {
  overflow: hidden;
  border: 1px solid var(--color-hull);
  border-radius: 0.75rem;
  background: var(--color-abyss);
}

.shot-toolbar {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  border-bottom: 1px solid var(--color-hull-soft);
  background: var(--color-surface);
  padding: 0.65rem 0.8rem;
}

.shot-toolbar span {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--color-hull);
}

.shot-toolbar p {
  min-width: 0;
  margin-left: 0.45rem;
  overflow: hidden;
  color: var(--color-muted);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shot-body { padding: 1rem; }

.shot-metric {
  min-width: 0;
  border: 1px solid var(--color-hull-soft);
  border-radius: 0.5rem;
  background: var(--color-surface-2);
  padding: 0.65rem;
}

.shot-metric p { color: var(--color-faint); font-size: 0.68rem; }

.shot-metric strong {
  display: block;
  margin-top: 0.25rem;
  color: var(--color-foam);
  font-family: var(--font-mono);
  font-size: 0.95rem;
}

.shot-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.65rem;
  border: 1px solid var(--color-hull-soft);
  border-radius: 0.45rem;
  background: color-mix(in srgb, var(--color-surface-2) 72%, transparent);
  padding: 0.55rem 0.65rem;
  font-size: 0.75rem;
}

/* ── API static placeholder ───────────────────────────────────────────────── */
.api-static-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 3rem 1.5rem;
  text-align: center;
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
.doc-footer {
  margin-top: 4rem;
  padding: 1.5rem 0 2.5rem;
  border-top: 1px solid var(--color-hull-soft);
}

.doc-footer-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
</style>
