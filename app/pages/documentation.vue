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
    desc: 'Real-time SSE event stream — swarm health at a glance: nodes, services, tasks, and cluster capacity. Metrics history is charted on node and service pages.'
  },
  {
    icon: 'i-lucide-bell',
    title: 'Alerts',
    desc: 'Notify Telegram, Teams, or any webhook on deploy failures, usage thresholds, node-down, degraded replicas, or disk pressure — with customizable message templates.'
  },
  {
    icon: 'i-lucide-shield-check',
    title: 'Access Control',
    desc: 'Three-role model (viewer, operator, admin) with local accounts, LDAP / Active Directory, and OIDC SSO. Stored credentials are encrypted at rest.'
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
  ['Runtime', 'Nuxt 4 (Vue 3) + TypeScript'],
  ['Database', 'PostgreSQL + TimescaleDB'],
  ['Live events', 'Server-Sent Events (SSE)'],
  ['API spec', 'OpenAPI 3.1 / Swagger UI v5'],
  ['Auth', 'JWT · LDAP / AD · OIDC (PKCE)'],
  ['Secrets', 'AES-256-GCM encryption at rest'],
  ['Alerts', 'Telegram · Microsoft Teams · Webhook'],
  ['Docker', 'Unix socket or remote TCP/TLS']
]

const quickStart = [
  { n: '1', title: 'Copy env file', code: 'cp .env.example .env' },
  { n: '2', title: 'Set required vars', code: 'NUXT_JWT_SECRET=your-secret\nNUXT_ADMIN_USERNAME=admin\nNUXT_ADMIN_PASSWORD=your-password' },
  { n: '3', title: 'Mount Docker socket', code: 'volumes:\n  - /var/run/docker.sock:/var/run/docker.sock' },
  { n: '4', title: 'Start the app', code: 'docker compose up -d\n# then open http://localhost:3000' }
]

// The interactive Swagger UI is its own full-page app served by the server; it
// opens in a new tab rather than being embedded, so it gets the whole viewport.
const swaggerUrl = '/api/swagger'

const homeNavCards: Array<{ id: string; label: string; icon: string; desc: string; external?: string }> = [
  { id: 'manual', label: 'User Manual', icon: 'i-lucide-book-open', desc: 'Feature guides organised into a General session plus one session per app module (Docker, Network, Server, IP Management).' },
  { id: 'configuration', label: 'Configuration', icon: 'i-lucide-sliders-horizontal', desc: 'General system & authentication setup, plus per-module configuration for Docker, Network, Server, and IP Management.' },
  { id: 'api', label: 'API Reference', icon: 'i-lucide-braces', desc: 'REST endpoints grouped per module, with a link to the interactive Swagger explorer for try-it-out.' }
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
    summary: 'Deploy compose files into Docker Swarm and keep desired state visible in KNetraHub.',
    steps: [
      'Open Stacks, add or edit a compose file, then deploy it.',
      'Use service names, images, ports, networks, volumes, secrets, and configs supported by KNetraHub.',
      'When GitLab is configured, review commit history and roll back to a previous compose version; each commit is attributed to the full name of the KNetraHub user who made the change.',
      'Watch service and task pages after deployment to verify replicas converge.',
      'Remove stops a stack\'s services but keeps its GitLab definition for history. Once a stack shows status Defined (in GitLab but not deployed), use Delete from GitLab to permanently remove the compose file too - this is irreversible and prompts for confirmation.'
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
    summary: 'Configure appearance, integration defaults, authentication providers, alerts, and UI-backed system settings - all admin-only.',
    steps: [
      'Use Authentication settings to enable LDAP or OIDC from the UI.',
      'Use Dock > Settings > Integrations to configure GitLab without touching container env; the status dot is only green when KNetraHub actually reaches it.',
      'Use Alerts to add notification channels (Telegram/Teams/Webhook) and tune which conditions notify you, with custom message templates.',
      'Save provider settings to store database overrides instead of editing container env.',
      'Use env defaults when you want to delete a saved override and return to .env values.',
      'Keep secrets masked in the UI unless you are actively rotating them - all of them are encrypted at rest.'
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
      'Complete host maintenance outside KNetraHub.',
      'Activate the node and confirm new tasks can be scheduled.'
    ]
  }
]

// ── Modules (Overview summary) ────────────────────────────────────────────────
// KNetraHub is a portal hosting several in-process apps. Each module owns its
// own pages, API routes, and docs sessions; portal-wide concerns (auth, users,
// appearance, alerts delivery) live in the General sessions.
const modules = [
  {
    id: 'docker',
    name: 'Docker',
    icon: 'i-lucide-container',
    tagline: 'Docker Swarm management',
    desc: 'Deploy and version compose stacks, scale and redeploy services, manage nodes, tasks, networks, volumes, secrets, configs, and private registries with live SSE monitoring.',
    points: ['Stacks & GitLab versioning', 'Services, tasks & nodes', 'Networks, volumes, secrets, configs']
  },
  {
    id: 'net',
    name: 'Network',
    icon: 'i-lucide-network',
    tagline: 'PRTG-style network monitoring',
    desc: 'Monitor devices and sensors, auto-discover ranges, visualise a distributed site map, collect via probes, run reports, and surface anomalies with AI insights.',
    points: ['Devices, sensors & maps', 'Auto-discovery & probes', 'Reports, alerts & AI insights']
  },
  {
    id: 'server',
    name: 'Server',
    icon: 'i-lucide-server-cog',
    tagline: 'Zabbix-style host monitoring',
    desc: 'Track host inventory, CPU / memory / disk metrics, agent status, and active problems and triggers across your server estate.',
    points: ['Host inventory & metrics', 'Agent status', 'Problems & triggers']
  },
  {
    id: 'ipmgt',
    name: 'IP Management',
    icon: 'i-lucide-id-card',
    tagline: 'phpIPAM-style address management',
    desc: 'Organise subnets and VLANs, inventory IP addresses, track assignment and utilisation, and keep allocation tidy.',
    points: ['Subnets & VLANs', 'Address inventory', 'Assignment & utilisation']
  }
]

// ── User Manual: Network module guides ────────────────────────────────────────
const netGuides = [
  {
    id: 'net-overview',
    title: 'Network Overview',
    icon: 'i-lucide-radar',
    summary: 'Start at the Network dashboard for device availability, active alerts, and top traffic talkers at a glance.',
    steps: [
      'Check the Up/Down device counters before drilling into an issue.',
      'Use Recent Alerts to jump straight to the affected device.',
      'Scan the Availability map for any red (down) tiles.',
      'Open Top Talkers to spot unusual NetFlow volume.'
    ],
    shot: {
      label: 'Network dashboard', status: 'Live',
      metrics: [['Devices', '11'], ['Up', '10'], ['Down', '1'], ['Active alerts', '2']] as [string, string][],
      rows: [['Core-Switch-01', '10.0.0.1', 'Up'], ['Firewall-FW1', '10.0.0.254', 'Down'], ['Synology-NAS-01', '10.0.0.50', 'Up']] as [string, string, string][]
    }
  },
  {
    id: 'net-devices',
    title: 'Devices',
    icon: 'i-lucide-router',
    summary: 'Maintain the inventory of monitored assets, add devices, and open a device for ports, sensors, and config backups.',
    steps: [
      'Filter by category or search by hostname/IP to find a device.',
      'Use Add Device to register a host — optionally apply a saved template to prefill SNMP/category defaults.',
      'Pause monitoring during maintenance, then Resume it (paused devices are skipped by the poller).',
      'Open a device for Ports, Sensors, Backups, a live latency graph, and per-device Settings.'
    ],
    shot: {
      label: 'Device inventory', status: 'SNMP',
      metrics: [['Total', '11'], ['Network', '6'], ['Servers', '2'], ['IoT', '1']] as [string, string][],
      rows: [['Core-Switch-01', 'Cisco IOS-XE', 'Up'], ['Router-B', 'Juniper Junos', 'Up'], ['HP-Printer-Floor1', 'Ping only', 'Up']] as [string, string, string][]
    }
  },
  {
    id: 'net-groups',
    title: 'Groups & templates',
    icon: 'i-lucide-folder-tree',
    summary: 'Organize devices into logical groups, and save onboarding templates so new devices are a single pick.',
    steps: [
      'Create a group (by site, role, or owner) and use Manage to add/remove member devices.',
      'In Network → Settings → Device Templates, save a template with the SNMP/category defaults you reuse.',
      'On Add Device, pick a template to prefill everything except hostname and IP.',
      'Categories are shared between the Add Device and Settings forms — see Settings → Categories.'
    ],
    shot: {
      label: 'Device groups', status: 'Organized',
      metrics: [['Groups', '3'], ['Templates', '2'], ['Categories', '5'], ['Devices', '11']] as [string, string][],
      rows: [['Core Switches', '4 devices', 'Group'], ['Branch Sites', '5 devices', 'Group'], ['Core Switch — SNMPv3', 'network', 'Template']] as [string, string, string][]
    }
  },
  {
    id: 'net-sensors',
    title: 'Sensors',
    icon: 'i-lucide-gauge',
    summary: 'Review every monitored measurement fleet-wide; state (Up / Warning / Down / Paused) is derived from each sensor\'s high/low limits. Open a sensor for its historical graph.',
    steps: [
      'Use the Up / Warning / Down / Paused summary to gauge overall health.',
      'Filter by sensor type (ping, traffic, temperature, fan…) to focus.',
      'Watch the load bar to see how close a reading is to its limit.',
      'Click a sensor to open its detail page: a history graph over 1h–7d with its limit thresholds, plus channels (e.g. a traffic sensor\'s In/Out), coverage, and last-scan interval.'
    ],
    shot: {
      label: 'Sensors', status: 'Monitored',
      metrics: [['Sensors', '7'], ['OK', '5'], ['Warning', '1'], ['Down', '1']] as [string, string][],
      rows: [['System Board Temp', '35.5 C', 'OK'], ['Rack Humidity', '45 %', 'OK'], ['Disk 1 Temp', '58 C', 'Warning']] as [string, string, string][]
    }
  },
  {
    id: 'net-maps',
    title: 'Maps',
    icon: 'i-lucide-map',
    summary: 'See probe sites on a world map and a live status wallboard of every device.',
    steps: [
      'Read the world map markers: green connected, orange has down devices, red disconnected.',
      'Hover a site marker for its up/down/sensor counts.',
      'Use the wallboard grid as a NOC screen of device status.',
      'Click a wallboard tile to open that device.'
    ],
    shot: {
      label: 'Distributed map', status: 'Wallboard',
      metrics: [['Sites', '4'], ['Connected', '3'], ['Devices up', '10'], ['Devices down', '1']] as [string, string][],
      rows: [['New York (HQ)', 'Local', 'Connected'], ['London', 'Remote', 'Connected'], ['Singapore', 'Multi-platform', 'Disconnected']] as [string, string, string][]
    }
  },
  {
    id: 'net-alerts',
    title: 'Alerts & rules',
    icon: 'i-lucide-bell-ring',
    summary: 'Review notification triggers (alert rules) and the active/historical alert stream. Delivery channels are configured portal-wide.',
    steps: [
      'Check the Notification Triggers cards for the rules and thresholds in force.',
      'Scan Alert History for active vs. recovered events.',
      'Acknowledge an active alert so the team knows it is owned (it still auto-recovers).',
      'Open the device on any alert row, or configure delivery channels in portal Settings.'
    ],
    shot: {
      label: 'Alerts', status: 'Triggers',
      metrics: [['Rules', '4'], ['Active', '1'], ['Critical', '1'], ['Warning', '1']] as [string, string][],
      rows: [['Device Down', 'status = down', 'Critical'], ['High Temperature', 'temperature > 70', 'Warning'], ['High CPU Load', 'cpu > 90', 'Critical']] as [string, string, string][]
    }
  },
  {
    id: 'net-discovery',
    title: 'Auto-Discovery',
    icon: 'i-lucide-scan-line',
    summary: 'Scan an IP range to create devices and a recommended sensor set automatically, then review scan history.',
    steps: [
      'Enter a CIDR (e.g. 10.0.5.0/24) and choose Ping/SNMP method.',
      'Start the scan (requires the Network operator tier).',
      'Review how many addresses were scanned and devices added.',
      'Open the inventory to tune the newly discovered devices.'
    ],
    shot: {
      label: 'Discovery scan', status: 'Completed',
      metrics: [['Scanned', '254'], ['Found', '4'], ['Added', '4'], ['Method', 'Ping+SNMP']] as [string, string][],
      rows: [['Cisco-118', '10.0.5.118', 'Added'], ['QNAP-64', '10.0.5.64', 'Added'], ['Aruba-201', '10.0.5.201', 'Added']] as [string, string, string][]
    }
  },
  {
    id: 'net-probes',
    title: 'Probes',
    icon: 'i-lucide-radio-tower',
    summary: 'Distributed data collectors (local, remote, multi-platform) and the device/sensor load each one carries.',
    steps: [
      'Confirm each probe is Connected before trusting its data.',
      'Read the device and sensor counts per probe to balance load.',
      'Use remote probes for branch sites separated by firewalls.',
      'Open Maps to see the same probes geographically.'
    ],
    shot: {
      label: 'Probes', status: 'Connected',
      metrics: [['Probes', '4'], ['Connected', '3'], ['Devices', '11'], ['Sensors', '7']] as [string, string][],
      rows: [['Local Probe', 'New York (HQ)', 'Connected'], ['Remote · London', 'London, UK', 'Connected'], ['Multi · Singapore', 'Singapore', 'Disconnected']] as [string, string, string][]
    }
  },
  {
    id: 'net-reports',
    title: 'Reports',
    icon: 'i-lucide-file-text',
    summary: 'Generate availability, traffic, sensor-health, or inventory reports that snapshot live data, then preview them.',
    steps: [
      'Pick a report type and a period.',
      'Click Generate to snapshot current data into a saved report.',
      'Select any report from the list to preview its headline and rows.',
      'Re-generate periodically to capture trends over time.'
    ],
    shot: {
      label: 'Report preview', status: 'Generated',
      metrics: [['Devices', '11'], ['Availability', '90.9%'], ['Down', '1'], ['Period', 'Last 30d']] as [string, string][],
      rows: [['Availability summary', 'Generated', 'HTML'], ['Traffic summary', 'Top talkers', 'HTML'], ['Sensor health', 'OK/Warn/Crit', 'HTML']] as [string, string, string][]
    }
  },
  {
    id: 'net-ai',
    title: 'AI Insights',
    icon: 'i-lucide-sparkles',
    summary: 'Use text search to find anomalies, similar-sensor matches, and smart recommendations so triage stays focused on purpose.',
    steps: [
      'Review Anomaly Detection for out-of-range sensors and down devices.',
      'Use text search to quickly find entries by device, metric, or intent.',
      'Review Similar Sensors list items to compare pairs and their % match score.',
      'Apply Smart Recommendations list items (add sensors, enable SNMP, group devices).',
      'Re-check after acting — counts update as the data changes.'
    ],
    shot: {
      label: 'AI insights', status: 'Analysing',
      metrics: [['Anomalies', '3'], ['Similar pairs', '2'], ['Recommendations', '6'], ['Model', 'Heuristic']] as [string, string][],
      rows: [['Core-Switch-01', 'CPU vs Memory · 94% match', 'Similar'], ['Firewall-FW1', 'Unreachable', 'Critical'], ['HP-Printer', 'Enable SNMP', 'Recommendation']] as [string, string, string][]
    }
  }
]

// ── User Manual: Server module guides ─────────────────────────────────────────
const serverGuides = [
  {
    id: 'server-overview',
    title: 'Server Overview',
    icon: 'i-lucide-radar',
    summary: 'A real Zabbix-style monitor: hosts are polled over ICMP + SNMP for availability and CPU/memory/disk/uptime, triggers raise 6-severity problems, and templates provision items in one click. The dashboard shows availability and problems-by-severity.',
    steps: [
      'Check Available vs. Unavailable hosts and the open-problem count.',
      'Read the problems-by-severity breakdown (Not classified → Disaster).',
      'Jump to Problems to acknowledge or close, or into a host for its graphs.',
      'Add hosts via Hosts or Discovery; link the "Linux by SNMP" template to collect data.'
    ],
    shot: {
      label: 'Server overview', status: 'Live',
      metrics: [['Hosts', '4'], ['Available', '3'], ['Offline', '1'], ['Problems', '2']] as [string, string][],
      rows: [['web-front-01', 'Ubuntu 22.04', 'Available'], ['db-prod-01', 'RHEL 9', 'Available'], ['win-util-01', 'Win 2022', 'Offline']] as [string, string, string][]
    }
  },
  {
    id: 'server-hosts',
    title: 'Hosts',
    icon: 'i-lucide-server',
    summary: 'Create hosts with an ICMP or SNMP interface, put them in host groups, and link templates to auto-provision items + triggers. Availability, items and problem counts come from the real poller. Configuration areas: Host groups, Templates, Triggers, Discovery, Web, Maintenance, Actions.',
    steps: [
      'Create a host (Poll method = SNMP for CPU/memory/disk) or run Discovery to sweep a CIDR.',
      'Link the "Linux by SNMP" template — its items + triggers appear on the host.',
      'Open a host for Latest data and per-item history graphs.',
      'Pause a host to stop polling; a Maintenance window suppresses its problems.'
    ],
    shot: {
      label: 'Hosts', status: 'Agents',
      metrics: [['Hosts', '4'], ['Agents up', '3'], ['Avg CPU', '37%'], ['Avg mem', '72%']] as [string, string][],
      rows: [['web-front-01', '45% CPU', 'Available'], ['db-prod-01', '90% mem', 'Available'], ['win-util-01', '— / —', 'Offline']] as [string, string, string][]
    }
  },
  {
    id: 'server-problems',
    title: 'Problems',
    icon: 'i-lucide-triangle-alert',
    summary: 'Triage active triggers by severity and acknowledge what is being worked on.',
    steps: [
      'Sort attention by severity (High, Average, Warning).',
      'Read the trigger text to understand the condition.',
      'Acknowledge a problem once someone owns it.',
      'Use duration to see how long a problem has persisted.'
    ],
    shot: {
      label: 'Problems', status: 'Triage',
      metrics: [['Active', '2'], ['High', '1'], ['Average', '1'], ['Acked', '1']] as [string, string][],
      rows: [['db-prod-01', 'Low disk on /var', 'High'], ['web-front-02', 'High CPU 5m', 'Average']] as [string, string, string][]
    }
  }
]

// ── User Manual: IP Management module guides ──────────────────────────────────
const ipmgtGuides = [
  {
    id: 'ipmgt-overview',
    title: 'IPAM Overview',
    icon: 'i-lucide-radar',
    summary: 'See subnet utilisation at a glance and find where address space is running low.',
    steps: [
      'Scan utilisation bars for subnets nearing capacity.',
      'Open a subnet to inspect its address inventory.',
      'Plan new allocations from the least-used subnets.',
      'Keep VLAN and gateway data accurate for each subnet.'
    ],
    shot: {
      label: 'IPAM overview', status: 'Utilisation',
      metrics: [['Subnets', '2'], ['Addresses', '512'], ['Used', '43%'], ['Free', '57%']] as [string, string][],
      rows: [['Server Vlan', '10.0.1.0/24', '70%'], ['DB Vlan', '10.0.2.0/24', '17%']] as [string, string, string][]
    }
  },
  {
    id: 'ipmgt-subnets',
    title: 'Subnets',
    icon: 'i-lucide-network',
    summary: 'Organise subnets and VLANs, with gateway and utilisation tracked per network.',
    steps: [
      'Create a subnet with its CIDR, VLAN, and gateway.',
      'Track utilisation as addresses are assigned.',
      'Open a subnet to manage its addresses.',
      'Keep gateways and descriptions current.'
    ],
    shot: {
      label: 'Subnets', status: 'Organised',
      metrics: [['Subnets', '2'], ['VLANs', '2'], ['Largest', '/24'], ['Peak use', '70%']] as [string, string][],
      rows: [['Server Vlan', 'VLAN 10', '10.0.1.254'], ['DB Vlan', 'VLAN 20', '10.0.2.254']] as [string, string, string][]
    }
  },
  {
    id: 'ipmgt-addresses',
    title: 'Addresses',
    icon: 'i-lucide-list-ordered',
    summary: 'Inventory individual addresses with hostname, MAC, description, and assignment state.',
    steps: [
      'Mark addresses Used, Reserved, or Available.',
      'Record hostname and MAC for assigned addresses.',
      'Reserve gateways and infrastructure addresses.',
      'Free addresses promptly when hosts are retired.'
    ],
    shot: {
      label: 'Addresses', status: 'Tracked',
      metrics: [['In subnet', '254'], ['Used', '2'], ['Reserved', '1'], ['Free', '251']] as [string, string][],
      rows: [['10.0.1.1', 'Gateway', 'Reserved'], ['10.0.1.10', 'web-front-01', 'Used'], ['10.0.1.11', 'web-front-02', 'Used']] as [string, string, string][]
    }
  }
]

// Manual is organised into one General (portal) session plus one session per
// app module. Docker guides are the original featureGuides minus the two
// portal-level ones, which move to General.
const GENERAL_MANUAL_IDS = ['users-audit', 'settings']
const manualGroups = [
  {
    id: 'manual-general',
    eyebrow: 'General · Portal',
    label: 'Portal & administration',
    icon: 'i-lucide-shield-check',
    summary: 'Cross-cutting pages that apply to the whole portal, independent of any single app.',
    guides: featureGuides.filter((g) => GENERAL_MANUAL_IDS.includes(g.id))
  },
  {
    id: 'manual-docker',
    eyebrow: 'Docker module',
    label: 'Docker Swarm management',
    icon: 'i-lucide-container',
    summary: 'Deploy and operate Docker Swarm: stacks, services, tasks, nodes, and the resources that connect them.',
    guides: featureGuides.filter((g) => !GENERAL_MANUAL_IDS.includes(g.id))
  },
  {
    id: 'manual-net',
    eyebrow: 'Network module',
    label: 'Network monitoring',
    icon: 'i-lucide-network',
    summary: 'Monitor devices and sensors, discover ranges, map distributed sites, and act on alerts and AI insights.',
    guides: netGuides
  },
  {
    id: 'manual-server',
    eyebrow: 'Server module',
    label: 'Server monitoring',
    icon: 'i-lucide-server-cog',
    summary: 'Track host availability, resource metrics, and active problems across the server estate.',
    guides: serverGuides
  },
  {
    id: 'manual-ipmgt',
    eyebrow: 'IP Management module',
    label: 'IP address management',
    icon: 'i-lucide-id-card',
    summary: 'Organise subnets and VLANs and keep address assignment and utilisation tidy.',
    guides: ipmgtGuides
  }
]

// ── Configuration data ────────────────────────────────────────────────────────
const configurationSections = [
  {
    id: 'integration',
    eyebrow: 'Integration',
    title: 'System and integration configuration',
    summary: 'These options connect KNetraHub to Docker, GitLab, persistent storage, and the visible app shell.',
    guides: [
      {
        id: 'runtime-config',
        title: 'Runtime configuration model',
        icon: 'i-lucide-sliders-horizontal',
        summary: 'Environment variables provide first-run defaults. Authentication, GitLab, Alerts, and Appearance settings saved in the UI are stored in Postgres and override those defaults until reset.',
        options: [
          ['NUXT_JWT_SECRET', 'Secret used to sign session tokens and to derive the key that encrypts stored credentials. Use a long random value in production.'],
          ['NUXT_ADMIN_USERNAME', 'First-run local admin username, created only when no users exist.'],
          ['NUXT_ADMIN_PASSWORD', 'First-run local admin password, created only when no users exist.'],
          ['NUXT_DB_HOST / PORT / NAME / USER / PASSWORD', 'Postgres + TimescaleDB connection. Stores users, settings, audit log, and metrics history.'],
          ['NUXT_METRICS_RETENTION_DAYS', 'Days of node/container/disk/network metrics history kept before it is dropped. Defaults to 30.'],
          ['NUXT_PUBLIC_APP_NAME', 'Default app name shown in the header and browser metadata; Settings > Appearance can override it, plus the logo and brand color, without restarting.']
        ] as [string, string][],
        steps: [
          'Copy .env.example to .env before the first run.',
          'Set NUXT_JWT_SECRET and the first-run admin credentials before production use.',
          'Point NUXT_DB_* at a reachable Postgres + TimescaleDB instance before starting the app.',
          'Use Settings for LDAP, OIDC, GitLab, Alerts, and Appearance changes that should be stored in the database instead of container env.'
        ],
        env: ['NUXT_JWT_SECRET', 'NUXT_ADMIN_USERNAME', 'NUXT_ADMIN_PASSWORD', 'NUXT_DB_HOST', 'NUXT_DB_PORT', 'NUXT_DB_NAME', 'NUXT_DB_USER', 'NUXT_DB_PASSWORD', 'NUXT_METRICS_RETENTION_DAYS', 'NUXT_PUBLIC_APP_NAME']
      },
      {
        id: 'appearance-config',
        title: 'Appearance & branding',
        icon: 'i-lucide-paintbrush',
        summary: 'Rebrand the running app without a rebuild: app name, brand color, logos, favicon, and PWA/app icon. Saved from Settings > Appearance as a database override - no env vars required.',
        options: [
          ['App name', 'Shown in the sidebar header, browser tab title, and PWA manifest name. Defaults to NUXT_PUBLIC_APP_NAME or "KNetraHub".'],
          ['Primary color', 'Hex color driving buttons, links, and accents app-wide, plus the PWA theme color.'],
          ['Horizontal logo', 'Wordmark shown on the login screen. Falls back to the built-in KNetraHub logo when unset.'],
          ['Icon logo', 'Square icon shown in the sidebar and header. Falls back to the built-in KNetraHub icon when unset.'],
          ['Favicon', 'Browser tab icon. Falls back to the built-in favicon set when unset.'],
          ['PWA / app icon', 'Installed-app and home-screen icon - drives the web app manifest icons and the Apple touch icon. Falls back to the built-in icon set when unset.']
        ] as [string, string][],
        steps: [
          'Open Settings > Appearance (admin only).',
          'Edit the app name and color, and/or upload logos, favicon, and PWA icon - each under about 1.5 MB.',
          'Watch the live preview update instantly; nothing is shared with other users yet.',
          'Click Save appearance to apply for everyone, or Revert preview to discard unsaved edits.',
          'Use Reset to defaults to remove the database override and return to the built-in branding. Favicon and PWA icon changes take effect immediately on the next page load - no rebuild needed.'
        ],
        env: ['NUXT_PUBLIC_APP_NAME']
      },
      {
        id: 'docker-config',
        title: 'Docker engine',
        icon: 'i-lucide-container',
        summary: 'KNetraHub must reach a Docker Swarm manager. Use the local socket for co-located installs or TCP/TLS for remote managers.',
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
        summary: 'GitLab stores compose files under a repository path so stack changes have commit history and rollback points. Configure it from environment defaults or entirely from Dock > Settings > Integrations - the token is encrypted at rest either way.',
        options: [
          ['NUXT_GITLAB_URL', 'GitLab instance base URL. Defaults to https://gitlab.com.'],
          ['NUXT_GITLAB_TOKEN', 'Personal, project, or deploy token with API access to the configured project. Encrypted at rest; shown masked in the UI.'],
          ['NUXT_GITLAB_PROJECT_ID', 'Numeric GitLab project ID that stores compose files.'],
          ['NUXT_GITLAB_BRANCH', 'Branch where compose files are committed. Defaults to main.'],
          ['NUXT_GITLAB_STACKS_PATH', 'Repository folder for stack compose files. Defaults to stacks.'],
          ['Connection status', 'The status dot in Settings turns green only when KNetraHub actually reaches the project with the saved token, distinguishing unreachable from invalid token.']
        ] as [string, string][],
        steps: [
          'Create or choose a GitLab project for operations state.',
          'Create a token with API access to the project.',
          'Set the URL, project ID, branch, and stacks path - via env vars or Dock > Settings > Integrations.',
          'Reload Settings and confirm the status dot turns green.',
          'Deploy a stack and verify the compose file appears under the configured path.',
          'Use stack history to view or roll back saved compose versions. Remove stops a stack\'s services but keeps its GitLab definition; once it shows status Defined, use Delete from GitLab to remove the compose file and history too.'
        ],
        env: ['NUXT_GITLAB_URL', 'NUXT_GITLAB_TOKEN', 'NUXT_GITLAB_PROJECT_ID', 'NUXT_GITLAB_BRANCH', 'NUXT_GITLAB_STACKS_PATH']
      },
      {
        id: 'alerts-config',
        title: 'Alerts & notifications',
        icon: 'i-lucide-bell',
        summary: 'Notify Telegram, Microsoft Teams, or any generic webhook when something needs attention. Configure channels and per-rule thresholds from Settings > Alerts; channel credentials are encrypted at rest.',
        options: [
          ['Channels', 'Telegram (bot token + chat ID), Microsoft Teams (incoming webhook URL), or generic Webhook (URL + custom headers). Add as many as needed - every enabled channel receives every alert.'],
          ['Deploy failed', 'Fires immediately when a stack deploy, rollback, redeploy, image update, or scale operation fails.'],
          ['Service usage threshold', 'Fires when a service\'s CPU and/or memory usage crosses a configurable percentage of its limit, reservation, or node capacity. Default 90%.'],
          ['Node down', 'Fires when a swarm node stops reporting heartbeats.'],
          ['Replicas degraded', 'Fires when a service stays under its desired replica count past a configurable grace period.'],
          ['Disk usage threshold', 'Fires when a node\'s disk usage crosses a configurable percentage. Default 85%.'],
          ['NUXT_ALERTS_ENABLED', 'Default state of the background poller that checks usage/node/replica/disk conditions. Defaults to true.'],
          ['NUXT_ALERTS_INTERVAL_MINUTES', 'How often that poller runs, in minutes. Defaults to 3.']
        ] as [string, string][],
        steps: [
          'Open Settings > Alerts and add a channel (Telegram, Teams, or Webhook).',
          'Use the channel\'s Test action to confirm delivery before relying on it.',
          'Enable or disable each rule and adjust its threshold where applicable.',
          'Open Customize message on a rule to edit its template using the listed {{placeholder}} fields, or Reset to restore the default.',
          'Trigger a real deploy failure or threshold breach once to confirm end-to-end delivery.'
        ],
        env: ['NUXT_ALERTS_ENABLED', 'NUXT_ALERTS_INTERVAL_MINUTES']
      },
      {
        id: 'alerts-telegram',
        title: 'Notifications: Telegram',
        icon: 'i-lucide-send',
        summary: 'Send alerts to a Telegram chat or channel through a bot you create with @BotFather. KNetraHub posts each alert as a plain text message via the Bot API - no webhook setup needed on Telegram\'s side.',
        options: [
          ['Bot token', 'Issued by @BotFather when you create the bot. Looks like 123456789:ABCdefGhIJKlmNoPQRstuVwXyz. Encrypted at rest; shown masked in Settings.'],
          ['Chat ID', 'Numeric ID of the user, group, or channel the bot should message. Negative for groups/channels (for example -1001234567890), positive for a direct user chat.'],
          ['Scope', 'One bot token can message many chats - add one KNetraHub channel per chat ID you want to notify.']
        ] as [string, string][],
        steps: [
          'Open a chat with @BotFather in Telegram and send /newbot.',
          'Choose a display name and a username ending in "bot", then copy the bot token BotFather replies with.',
          'Add the bot to the target group or channel (or just open a direct chat with it), and send any message so the bot can see that chat.',
          'Visit https://api.telegram.org/bot<token>/getUpdates in a browser (with your token in place of <token>) and read the chat.id value from the JSON response - that is the chat ID.',
          'In KNetraHub, go to Settings > Alerts > Add channel, choose Telegram, paste the bot token and chat ID, then save.',
          'Use the channel\'s Test action and confirm the message arrives in the chat before relying on it.'
        ],
        env: [] as string[]
      },
      {
        id: 'alerts-teams',
        title: 'Notifications: Microsoft Teams',
        icon: 'i-lucide-users',
        summary: 'Send alerts to a Teams channel using a classic Incoming Webhook connector. KNetraHub posts each alert as a MessageCard for broad compatibility across Teams tenants.',
        options: [
          ['Webhook URL', 'The unique URL Teams generates for the Incoming Webhook connector on one specific channel. Encrypted at rest; shown masked in Settings.'],
          ['Scope', 'A webhook URL is tied to one channel - add a separate KNetraHub channel per Teams channel you want to notify.'],
          ['Card format', 'Alerts are posted as a classic MessageCard. If your tenant has disabled classic connectors, use a Workflow-based webhook URL instead - the URL works the same way once issued.']
        ] as [string, string][],
        steps: [
          'In Teams, open the target channel, click the "..." menu, and choose Connectors (or Workflows on tenants where classic connectors are retired).',
          'Add/configure "Incoming Webhook", give it a name such as KNetraHub Alerts, and optionally upload an icon.',
          'Copy the generated webhook URL - Teams only displays it once, so save it somewhere safe immediately.',
          'In KNetraHub, go to Settings > Alerts > Add channel, choose Microsoft Teams, paste the webhook URL, then save.',
          'Use the channel\'s Test action and confirm a card posts to the channel before relying on it.'
        ],
        env: [] as string[]
      },
      {
        id: 'alerts-webhook',
        title: 'Notifications: Generic webhook',
        icon: 'i-lucide-webhook',
        summary: 'Send alerts as a JSON POST to any URL you control - useful for Slack incoming webhooks, custom automation, or a chat tool not natively supported.',
        options: [
          ['URL', 'Endpoint KNetraHub sends the POST request to. Encrypted at rest; shown masked in Settings.'],
          ['Headers', 'Optional, one per line written as "Key: Value" - use this for an Authorization header or any other header your endpoint requires.'],
          ['Payload', 'KNetraHub POSTs JSON shaped { "text": "<rendered alert message>" }. Most chat-style webhooks, including Slack\'s, read a top-level text field.']
        ] as [string, string][],
        steps: [
          'Stand up or choose an endpoint that accepts a POST with a JSON body and returns a 2xx status.',
          'If the endpoint needs authentication, note the exact header name and value it expects, for example Authorization: Bearer <token>.',
          'In KNetraHub, go to Settings > Alerts > Add channel, choose Webhook, enter the URL, and add any headers one per line as Key: Value.',
          'Use the channel\'s Test action and confirm your endpoint receives the request and returns success.',
          'For Slack, paste its "Incoming Webhook" app URL directly into the URL field - no extra headers are needed.'
        ],
        env: [] as string[]
      }
    ]
  },
  {
    id: 'authentication',
    eyebrow: 'Authentication',
    title: 'Authentication and role mapping',
    summary: 'KNetraHub supports local users, LDAP / Active Directory, and OIDC SSO. LDAP and OIDC can be configured from environment defaults or saved UI overrides.',
    guides: [
      {
        id: 'local-auth',
        title: 'Local accounts',
        icon: 'i-lucide-user-round-cog',
        summary: 'Local users are stored in the KNetraHub database and are useful for first-run access, break-glass administration, and smaller teams.',
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
          ['NUXT_OIDC_ISSUER', 'Provider issuer URL. KNetraHub reads {issuer}/.well-known/openid-configuration.'],
          ['NUXT_OIDC_CLIENT_ID', 'Client ID registered at the provider.'],
          ['NUXT_OIDC_CLIENT_SECRET', 'Client secret for confidential clients.'],
          ['NUXT_OIDC_REDIRECT_URI', 'Optional callback override. Blank means {origin}/api/auth/oidc/callback.'],
          ['NUXT_OIDC_SCOPE', 'Requested scopes. Default is openid profile email groups.'],
          ['NUXT_OIDC_USERNAME_CLAIM', 'Claim used as KNetraHub username. Default is preferred_username.'],
          ['NUXT_OIDC_DISPLAY_NAME_CLAIM', 'Claim used as display name. Default is name.'],
          ['NUXT_OIDC_GROUPS_CLAIM', 'Claim that carries group names. Dot paths such as realm_access.roles are supported.'],
          ['NUXT_OIDC_ADMIN_GROUP', 'Group value mapped to the admin role.'],
          ['NUXT_OIDC_OPERATOR_GROUP', 'Group value mapped to the operator role.'],
          ['NUXT_OIDC_PROVIDER_NAME', 'Login button label, for example Keycloak, Authentik, or Company SSO.']
        ] as [string, string][],
        steps: [
          'Create an OIDC client in your identity provider.',
          'Register the KNetraHub callback URL exactly.',
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
          ['Client ID', 'knetrahub'],
          ['Redirect URI', 'https://knetrahub.example.com/api/auth/oidc/callback'],
          ['Scope', 'openid profile email groups'],
          ['Groups claim', 'groups from a Group Membership mapper.'],
          ['Role groups', 'swarm-admins and swarm-operators, or your own group names.']
        ] as [string, string][],
        steps: [
          'Create or choose a realm, for example infrastructure.',
          'Create an OpenID Connect client with Client ID knetrahub.',
          'Enable client authentication so Keycloak issues a client secret.',
          'Keep standard authorization code flow enabled.',
          'Add the exact KNetraHub callback URL as a valid redirect URI and the KNetraHub origin as a web origin.',
          'Add a Group Membership mapper with token claim name groups.',
          'Copy the realm issuer, client ID, and secret into KNetraHub.'
        ],
        env: ['NUXT_OIDC_ISSUER', 'NUXT_OIDC_CLIENT_ID', 'NUXT_OIDC_CLIENT_SECRET', 'NUXT_OIDC_GROUPS_CLAIM', 'NUXT_OIDC_ADMIN_GROUP', 'NUXT_OIDC_OPERATOR_GROUP']
      },
      {
        id: 'authentik',
        title: 'OIDC: Authentik',
        icon: 'i-lucide-fingerprint',
        summary: 'Create an Authentik application with an OAuth2/OpenID provider, then use the provider issuer and client credentials in KNetraHub.',
        options: [
          ['Issuer', 'Default per-provider issuer such as https://authentik.example.com/application/o/knetrahub/.'],
          ['Client type', 'Confidential client with a client ID and client secret.'],
          ['Redirect URI', 'https://knetrahub.example.com/api/auth/oidc/callback as an authorization redirect URI.'],
          ['Scope', 'openid profile email groups.'],
          ['Groups claim', 'groups, or a custom property mapping that returns group names.'],
          ['Provider name', 'Authentik or your organization SSO label.']
        ] as [string, string][],
        steps: [
          'Create a new Application in Authentik, for example KNetraHub.',
          'Create or attach an OAuth2/OpenID provider.',
          'Set the redirect URI to the exact KNetraHub callback URL.',
          'Use the default per-provider issuer mode unless your environment requires a global issuer.',
          'Copy the provider client ID, client secret, and issuer URL into KNetraHub.',
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
          ['Callback', 'The provider must allow the exact KNetraHub callback URL.'],
          ['Claims', 'Use preferred_username/name/groups when available, or adjust the claim fields in Settings.'],
          ['Groups', 'If groups are nested, set a dot path such as realm_access.roles.'],
          ['Userinfo fallback', 'KNetraHub checks userinfo when the ID token does not include the configured groups claim.']
        ] as [string, string][],
        steps: [
          'Create a web or confidential OIDC application.',
          'Enable authorization code flow and PKCE when the provider asks.',
          'Register the callback URL shown in KNetraHub Settings.',
          'Request openid profile email groups or the provider equivalent.',
          'Test with a user that should be viewer, operator, and admin.'
        ],
        env: ['NUXT_OIDC_ISSUER', 'NUXT_OIDC_SCOPE', 'NUXT_OIDC_USERNAME_CLAIM', 'NUXT_OIDC_DISPLAY_NAME_CLAIM', 'NUXT_OIDC_GROUPS_CLAIM']
      },
      {
        id: 'ldap-config',
        title: 'LDAP / Active Directory',
        icon: 'i-lucide-building-2',
        summary: 'LDAP login binds with a service account, searches for the user, verifies the password as that user, then maps memberOf groups to KNetraHub roles.',
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
          'Use LDAPS when possible and confirm KNetraHub can reach the directory.',
          'Create a least-privilege bind account that can search users and read group membership.',
          'Set the user search base and filter.',
          'Map admin and operator group DNs to KNetraHub roles.',
          'Test one user from each expected role and one user with no mapped group.'
        ],
        env: ['NUXT_LDAP_ENABLED', 'NUXT_LDAP_URL', 'NUXT_LDAP_BIND_DN', 'NUXT_LDAP_BIND_CREDENTIALS', 'NUXT_LDAP_SEARCH_BASE', 'NUXT_LDAP_SEARCH_FILTER', 'NUXT_LDAP_GROUP_SEARCH_BASE', 'NUXT_LDAP_GROUP_SEARCH_FILTER', 'NUXT_LDAP_ADMIN_GROUP', 'NUXT_LDAP_OPERATOR_GROUP']
      }
    ]
  }
]

// ── Configuration: per-module guides ──────────────────────────────────────────
// The Network module performs REAL monitoring: a background poller pings every
// device (ICMP) and reads SNMP v1/v2c system + interface data each cycle.
const netConfigGuides = [
  {
    id: 'net-monitoring-config',
    title: 'Polling & SNMP',
    icon: 'i-lucide-network',
    summary: 'Devices are monitored for real. The poller ICMP-pings every device each cycle (status + latency) and, for SNMP devices, reads system info and the interface table (up/down, speed, bit-rate from counter deltas). SNMP version/community are stored per device.',
    options: [
      ['Poll method', 'Per device: Ping (ICMP reachability + latency) or SNMP (also system info + interfaces).'],
      ['SNMP version', 'v1 or v2c per device. SNMPv3 (auth/priv) is not supported yet — v3 devices are pinged only.'],
      ['SNMP community', 'Stored per device (shown masked). Falls back to NUXT_NET_SNMP_COMMUNITY when unset.'],
      ['Poll interval', 'NUXT_NET_POLL_INTERVAL_SECONDS (default 60). The first interface poll seeds counters; bit-rates appear from the second poll on.'],
      ['Enable / disable', 'NUXT_NET_POLLING_ENABLED=false stops all polling. Requires a working ping binary + UDP/161 reachability to devices.']
    ] as [string, string][],
    steps: [
      'Ensure the server can reach devices: ICMP allowed, and UDP/161 open for SNMP.',
      'Add a device (Devices > Add Device) with its IP and poll method.',
      'For SNMP, set the version (v1/v2c) and community in the device Settings tab.',
      'Wait one poll interval, then open the device — status, latency, and ports populate.'
    ],
    env: ['NUXT_NET_POLLING_ENABLED', 'NUXT_NET_POLL_INTERVAL_SECONDS', 'NUXT_NET_POLL_CONCURRENCY', 'NUXT_NET_SNMP_COMMUNITY', 'NUXT_NET_SNMP_VERSION', 'NUXT_NET_SNMP_TIMEOUT_MS', 'NUXT_NET_PING_TIMEOUT_SECONDS']
  },
  {
    id: 'net-discovery-config',
    title: 'Auto-discovery, probes & alerts',
    icon: 'i-lucide-scan-line',
    summary: 'Auto-discovery runs a real ICMP/SNMP sweep of a CIDR and creates a device (plus an ICMP-latency sensor) for each responder; the poller then fills in interfaces. A device going unreachable raises a critical alert; recovery clears it.',
    options: [
      ['Scan input', 'A CIDR (≤ 1024 hosts/scan) + method: Ping, SNMP, or Ping+SNMP, with an optional SNMP community. Scanning needs the Monitoring operator tier (monitoring.scan).'],
      ['Identification', 'SNMP responders are named from sysName and tagged with vendor/OS from sysObjectID/sysDescr; ping-only responders are added as Host.'],
      ['Probes', 'A single Local Probe (this server) collects data; new devices attach to it. Remote/distributed probes are a deployment concern, not fabricated.'],
      ['Alerts & delivery', 'Up/down transitions raise and clear alerts automatically. Delivery channels (Telegram/Teams/Webhook) are portal-wide — see General · System.']
    ] as [string, string][],
    steps: [
      'Open Network > Discovery, enter a subnet (e.g. 192.168.1.0/24) and community.',
      'Run the scan; responders are added and appear under Devices within a poll cycle.',
      'Remove anything unwanted with the delete action on the Devices list.',
      'Tune thresholds on the Alerts page; configure delivery once in Settings > Alerts.'
    ],
    env: ['NUXT_NET_DISCOVERY_CONCURRENCY', 'NUXT_NET_SNMP_COMMUNITY', 'NUXT_NET_SNMP_VERSION']
  }
]

const serverConfigGuides = [
  {
    id: 'server-config',
    title: 'Agents & metrics',
    icon: 'i-lucide-server-cog',
    summary: 'Hosts report OS, agent status, and CPU/memory/disk metrics; problems are raised by triggers. MVP host and problem data is seeded and simulated.',
    options: [
      ['Agent', 'Each host records its monitoring agent (e.g. Zabbix agent) and availability state.'],
      ['Metrics', 'CPU, memory, and uptime per host drive overview and capacity views.'],
      ['Problems', 'Triggers raise problems with severity (High/Average/Warning) and an ack flag.'],
      ['Access', 'Gated by the Monitoring app tier; admin settings require monitoring.manage.']
    ] as [string, string][],
    steps: [
      'Open Monitoring > Server and confirm hosts report as Available.',
      'Review CPU/memory pressure on the overview.',
      'Triage and acknowledge problems by severity.',
      'Use Server > Settings (admin) for app-level options.'
    ],
    env: [] as string[]
  }
]

const ipmgtConfigGuides = [
  {
    id: 'ipmgt-config',
    title: 'Subnets & assignment',
    icon: 'i-lucide-id-card',
    summary: 'IPAM organises subnets/VLANs and tracks address state (Used/Reserved/Available). MVP subnet and address data is seeded.',
    options: [
      ['Subnet', 'CIDR, VLAN, and gateway define each network; utilisation is tracked as addresses are used.'],
      ['Address state', 'Used, Reserved, or Available — with hostname, MAC, and description.'],
      ['Utilisation', 'Per-subnet usage drives the overview bars and capacity planning.'],
      ['Access', 'Gated by the IP Management app tier; deletes require the admin tier (ipmgt.delete).']
    ] as [string, string][],
    steps: [
      'Create subnets with CIDR, VLAN, and gateway.',
      'Reserve infrastructure addresses (gateways, anchors).',
      'Assign addresses with hostname and MAC as hosts come online.',
      'Free addresses when hosts are retired to keep utilisation accurate.'
    ],
    env: [] as string[]
  }
]

// Configuration is organised into General sessions (system + authentication,
// which apply portal-wide) and one session per app module. The existing guides
// are mapped to a session id; new module guides live in their own arrays.
const CONFIG_MODULE_OF: Record<string, string> = {
  'runtime-config': 'general-system',
  'appearance-config': 'general-system',
  'alerts-config': 'general-system',
  'alerts-telegram': 'general-system',
  'alerts-teams': 'general-system',
  'alerts-webhook': 'general-system',
  'docker-config': 'docker',
  'gitlab-config': 'docker',
  'local-auth': 'general-auth',
  'oidc-config': 'general-auth',
  'keycloak': 'general-auth',
  'authentik': 'general-auth',
  'generic-oidc': 'general-auth',
  'ldap-config': 'general-auth'
}

const configModuleGroups = [
  { id: 'general-system', eyebrow: 'General · System', title: 'System & main configuration', summary: 'Runtime, branding, and alert-delivery options that apply to the whole portal regardless of which app you use.' },
  { id: 'docker', eyebrow: 'Docker module', title: 'Docker engine & stack versioning', summary: 'Connect to the Swarm manager and store compose files in GitLab for history and rollback.' },
  { id: 'net', eyebrow: 'Network module', title: 'Network monitoring configuration', summary: 'Polling/SNMP per device, auto-discovery, probes, and alert rules in the Monitoring app.' },
  { id: 'server', eyebrow: 'Server module', title: 'Server monitoring configuration', summary: 'Agents, host metrics, and problem triggers in the Monitoring app.' },
  { id: 'ipmgt', eyebrow: 'IP Management module', title: 'IPAM configuration', summary: 'Subnets, VLANs, and address assignment for the IP Management app.' },
  { id: 'general-auth', eyebrow: 'General · Authentication', title: 'Authentication & role mapping', summary: 'Local accounts, OIDC SSO, and LDAP/AD — portal-wide identity that applies across every app.' }
]

function configGuidesFor(moduleId: string) {
  if (moduleId === 'net') return netConfigGuides
  if (moduleId === 'server') return serverConfigGuides
  if (moduleId === 'ipmgt') return ipmgtConfigGuides
  return configurationSections.flatMap((s) => s.guides).filter((g) => CONFIG_MODULE_OF[g.id] === moduleId)
}

// ── API Reference: endpoints grouped per module ───────────────────────────────
// The interactive Swagger explorer currently covers the Docker/core API in full
// (try-it-out). These groups document each module's REST surface; the monitoring
// modules are read-mostly today.
const apiGroups = [
  {
    id: 'api-general',
    label: 'General · Core',
    icon: 'i-lucide-shield-check',
    desc: 'Authentication, API tokens, users, preferences, and portal system data. Apply across every module.',
    endpoints: [
      ['POST', '/auth/login', 'Sign in and start a session'],
      ['GET', '/auth/me', 'Current user and entitlements'],
      ['GET', '/user/tokens', 'List API tokens'],
      ['POST', '/user/tokens', 'Create an API token'],
      ['GET', '/users', 'User management (admin)'],
      ['GET', '/system/overview', 'Portal/system overview']
    ] as [string, string, string][]
  },
  {
    id: 'api-docker',
    label: 'Docker module',
    icon: 'i-lucide-container',
    desc: 'Full CRUD and operations for Swarm. This module is fully documented and try-it-out enabled in the interactive explorer.',
    endpoints: [
      ['GET', '/services', 'List services'],
      ['POST', '/services/{id}/scale', 'Scale a service'],
      ['GET', '/stacks', 'List stacks'],
      ['POST', '/stacks', 'Deploy a stack'],
      ['GET', '/nodes', 'List swarm nodes'],
      ['GET', '/networks · /volumes · /secrets · /configs', 'Swarm resources']
    ] as [string, string, string][]
  },
  {
    id: 'api-net',
    label: 'Network module',
    icon: 'i-lucide-network',
    desc: 'Devices, sensors, probes, discovery, reports, alerts, and AI insights in the Monitoring app.',
    endpoints: [
      ['GET', '/net/devices', 'List devices'],
      ['POST', '/net/devices', 'Add a device'],
      ['GET', '/net/sensors', 'All sensors with derived state'],
      ['GET', '/net/probes', 'Probes with device/sensor load'],
      ['POST', '/net/discovery', 'Run a discovery scan'],
      ['POST', '/net/reports', 'Generate a report'],
      ['GET', '/net/ai', 'Anomalies, similar sensors, recommendations'],
      ['GET', '/net/alerts · /net/rules', 'Alerts and rules']
    ] as [string, string, string][]
  },
  {
    id: 'api-server',
    label: 'Server module',
    icon: 'i-lucide-server-cog',
    desc: 'Host inventory and active problems in the Monitoring app.',
    endpoints: [
      ['GET', '/server/hosts', 'List hosts'],
      ['GET', '/server/hosts/{id}', 'Host detail and metrics'],
      ['GET', '/server/problems', 'Active problems and triggers']
    ] as [string, string, string][]
  },
  {
    id: 'api-ipmgt',
    label: 'IP Management module',
    icon: 'i-lucide-id-card',
    desc: 'Subnets and address inventory for the IP Management app.',
    endpoints: [
      ['GET', '/ipmgt/subnets', 'List subnets'],
      ['GET', '/ipmgt/subnets/{id}', 'Subnet detail'],
      ['GET', '/ipmgt/subnets/{id}/ips', 'Addresses in a subnet']
    ] as [string, string, string][]
  }
]

const keycloakKeyValues: [string, string][] = [
  ['Realm', 'infrastructure'],
  ['Client ID', 'knetrahub'],
  ['Client auth', 'On'],
  ['Redirect URI', 'https://knetrahub.example.com/api/auth/oidc/callback'],
  ['Web origin', 'https://knetrahub.example.com']
]

const knetrahubOidcValues: [string, string][] = [
  ['Provider label', 'Keycloak'],
  ['Issuer URL', 'https://keycloak.example.com/realms/infrastructure'],
  ['Client ID', 'knetrahub'],
  ['Scope', 'openid profile email groups'],
  ['Groups claim', 'groups'],
  ['Admin group', 'swarm-admins'],
  ['Operator group', 'swarm-operators']
]

const authentikValues: [string, string][] = [
  ['Application', 'KNetraHub'],
  ['Provider', 'OAuth2/OpenID'],
  ['Issuer mode', 'Per-provider'],
  ['Issuer URL', 'https://authentik.example.com/application/o/knetrahub/'],
  ['Redirect URI', 'https://knetrahub.example.com/api/auth/oidc/callback']
]

const keycloakSteps = [
  { title: '1. Create or choose a realm', body: 'Use a realm dedicated to infrastructure access, for example infrastructure. The KNetraHub issuer URL will end with /realms/infrastructure.' },
  { title: '2. Create an OpenID Connect client', body: 'In Clients, create a client with Client ID knetrahub and Client type OpenID Connect. Use a confidential client by enabling client authentication.' },
  { title: '3. Configure login settings', body: 'Keep the standard authorization code flow enabled. Add the KNetraHub callback URL as a valid redirect URI and add the KNetraHub origin as a web origin.' },
  { title: '4. Copy the client secret', body: 'Open the client Credentials tab and copy the generated secret into KNetraHub. Rotate it if it was exposed.' },
  { title: '5. Add groups and memberships', body: 'Create groups such as swarm-admins and swarm-operators. Add users to the group that matches their KNetraHub role.' },
  { title: '6. Add a groups claim mapper', body: 'In the client dedicated scope or a client scope assigned to KNetraHub, add a Group Membership mapper with token claim name groups. Include it in the ID token or userinfo response.' }
]

const knetrahubSteps = [
  { title: '1. Open Settings > Authentication', body: 'Enable OIDC single sign-on and keep local admin access available until SSO is tested.' },
  { title: '2. Paste provider values', body: 'Use the issuer URL, client ID, and client secret from the provider. Do not include the /.well-known/openid-configuration suffix.' },
  { title: '3. Confirm callback URL', body: 'Leave Redirect URI blank when the shown effective URL is the public URL users reach. Set it explicitly when KNetraHub is behind a proxy.' },
  { title: '4. Map claims and groups', body: 'Use preferred_username for username, name for display name, groups for groups claim, and the same group values you configured at the provider.' },
  { title: '5. Save and test', body: 'Click Save OIDC, sign out, and test the SSO login button. Verify the synced user has the expected role in Users.' }
]

const authentikSteps = [
  { title: '1. Create application and provider', body: 'In Authentik, create an Application named KNetraHub and attach an OAuth2/OpenID provider.' },
  { title: '2. Configure redirect URI', body: 'Add the KNetraHub callback URL as an authorization redirect URI. It must match the effective redirect URI shown in KNetraHub.' },
  { title: '3. Keep per-provider issuer mode', body: 'The default per-provider issuer produces an issuer like https://authentik.example.com/application/o/knetrahub/. Copy that value into KNetraHub.' },
  { title: '4. Confirm scopes and claims', body: 'Allow openid, profile, email, and groups, or add property mappings that expose equivalent username, display name, email, and groups claims.' },
  { title: '5. Save and test', body: 'Set provider label to Authentik, save OIDC, then test login with users from admin, operator, and viewer paths.' }
]

const troubleshooting: [string, string][] = [
  ['Invalid redirect_uri', 'The provider redirect URI must exactly match KNetraHub effective redirect URI, including scheme, host, path, and port.'],
  ['OIDC discovery failed', 'Use the issuer URL only, not the /.well-known/openid-configuration URL. Confirm KNetraHub can reach the provider from the server.'],
  ['User logs in as viewer', 'The groups claim did not match admin/operator values, or the provider did not include groups in ID token/userinfo.'],
  ['Client authentication failed', 'Check the client secret and confirm the provider client is configured as confidential when a secret is required.'],
  ['Works locally but not through proxy', 'Set NUXT_OIDC_REDIRECT_URI or the UI Redirect URI to the external HTTPS callback URL.']
]

// ── Sidebar navigation config ─────────────────────────────────────────────────
type NavSub = { id?: string; label: string; icon?: string; heading?: boolean }
const navConfig: Array<{ id: string; label: string; icon: string; external?: string; subs: NavSub[] }> = [
  {
    id: 'home',
    label: 'Overview',
    icon: 'i-lucide-layout-dashboard',
    subs: [
      { heading: true, label: 'On this page' },
      { id: 'home-capabilities', label: 'Core capabilities', icon: 'i-lucide-sparkles' },
      { id: 'home-modules',      label: 'Modules',           icon: 'i-lucide-layout-grid' },
      { id: 'home-architecture', label: 'Stack & roles',     icon: 'i-lucide-cpu' },
      { id: 'home-quickstart',   label: 'Quick start',       icon: 'i-lucide-rocket' },
      { id: 'home-explore',      label: 'Explore the docs',  icon: 'i-lucide-compass' }
    ]
  },
  {
    id: 'manual',
    label: 'User Manual',
    icon: 'i-lucide-book-open',
    subs: [
      { heading: true, label: 'General' },
      { id: 'users-audit',      label: 'Users & Audit',      icon: 'i-lucide-users' },
      { id: 'settings',         label: 'Settings',           icon: 'i-lucide-settings' },
      { heading: true, label: 'Docker' },
      { id: 'dashboard',        label: 'Dashboard',          icon: 'i-lucide-radar' },
      { id: 'stacks',           label: 'Stacks',             icon: 'i-lucide-layers' },
      { id: 'services',         label: 'Services',           icon: 'i-lucide-boxes' },
      { id: 'tasks-containers', label: 'Tasks & Containers', icon: 'i-lucide-list-checks' },
      { id: 'nodes',            label: 'Nodes',              icon: 'i-lucide-server' },
      { id: 'networks-volumes', label: 'Networks & Volumes', icon: 'i-lucide-network' },
      { id: 'secrets-configs',  label: 'Secrets & Configs',  icon: 'i-lucide-key-round' },
      { id: 'registries',       label: 'Registries',         icon: 'i-lucide-package' },
      { id: 'workflows',        label: 'Common Workflows',   icon: 'i-lucide-route' },
      { heading: true, label: 'Network' },
      { id: 'net-overview',     label: 'Network Overview',   icon: 'i-lucide-radar' },
      { id: 'net-devices',      label: 'Devices',            icon: 'i-lucide-router' },
      { id: 'net-sensors',      label: 'Sensors',            icon: 'i-lucide-gauge' },
      { id: 'net-maps',         label: 'Maps',               icon: 'i-lucide-map' },
      { id: 'net-alerts',       label: 'Alerts & rules',     icon: 'i-lucide-bell-ring' },
      { id: 'net-discovery',    label: 'Auto-Discovery',     icon: 'i-lucide-scan-line' },
      { id: 'net-probes',       label: 'Probes',             icon: 'i-lucide-radio-tower' },
      { id: 'net-reports',      label: 'Reports',            icon: 'i-lucide-file-text' },
      { id: 'net-ai',           label: 'AI Insights',        icon: 'i-lucide-sparkles' },
      { heading: true, label: 'Server' },
      { id: 'server-overview',  label: 'Server Overview',    icon: 'i-lucide-radar' },
      { id: 'server-hosts',     label: 'Hosts',              icon: 'i-lucide-server' },
      { id: 'server-problems',  label: 'Problems',           icon: 'i-lucide-triangle-alert' },
      { heading: true, label: 'IP Management' },
      { id: 'ipmgt-overview',   label: 'IPAM Overview',      icon: 'i-lucide-radar' },
      { id: 'ipmgt-subnets',    label: 'Subnets',            icon: 'i-lucide-network' },
      { id: 'ipmgt-addresses',  label: 'Addresses',          icon: 'i-lucide-list-ordered' }
    ]
  },
  {
    id: 'configuration',
    label: 'Configuration',
    icon: 'i-lucide-sliders-horizontal',
    subs: [
      { heading: true, label: 'General · System' },
      { id: 'runtime-config',    label: 'Runtime Config',    icon: 'i-lucide-sliders-horizontal' },
      { id: 'appearance-config', label: 'Appearance',        icon: 'i-lucide-paintbrush' },
      { id: 'alerts-config',     label: 'Alerts',            icon: 'i-lucide-bell' },
      { id: 'alerts-telegram',   label: 'Alerts: Telegram',  icon: 'i-lucide-send' },
      { id: 'alerts-teams',      label: 'Alerts: Teams',     icon: 'i-lucide-users' },
      { id: 'alerts-webhook',    label: 'Alerts: Webhook',   icon: 'i-lucide-webhook' },
      { heading: true, label: 'Docker' },
      { id: 'docker-config',     label: 'Docker Engine',     icon: 'i-lucide-container' },
      { id: 'gitlab-config',     label: 'GitLab Versioning', icon: 'i-lucide-git-branch' },
      { heading: true, label: 'Network' },
      { id: 'net-monitoring-config', label: 'Polling & SNMP', icon: 'i-lucide-network' },
      { id: 'net-discovery-config',  label: 'Discovery & Rules', icon: 'i-lucide-scan-line' },
      { heading: true, label: 'Server' },
      { id: 'server-config',     label: 'Agents & Metrics',  icon: 'i-lucide-server-cog' },
      { heading: true, label: 'IP Management' },
      { id: 'ipmgt-config',      label: 'Subnets & Assignment', icon: 'i-lucide-id-card' },
      { heading: true, label: 'General · Authentication' },
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
    subs: [
      { heading: true, label: 'By module' },
      { id: 'api-general', label: 'General · Core',        icon: 'i-lucide-shield-check' },
      { id: 'api-docker',  label: 'Docker module',         icon: 'i-lucide-container' },
      { id: 'api-net',     label: 'Network module',        icon: 'i-lucide-network' },
      { id: 'api-server',  label: 'Server module',         icon: 'i-lucide-server-cog' },
      { id: 'api-ipmgt',   label: 'IP Management module',  icon: 'i-lucide-id-card' }
    ]
  }
]

// ── Docs search index (navbar smart search) ───────────────────────────────────
// Flattens every guide, configuration topic, API group/endpoint, and Overview
// block into searchable entries scored by the DocsSearch palette. Env vars and
// option names ride along as keywords so "NUXT_OIDC_ISSUER" or "bot token"
// finds the right topic. Section-level entries (no anchor) double as quick
// links when the palette query is empty.
type DocSearchEntry = { section: string; anchor?: string; title: string; description: string; group: string; icon: string; keywords?: string }

const searchIndex: DocSearchEntry[] = [
  { section: 'home', title: 'Overview', description: 'What KNetraHub is: core capabilities, modules, technology stack, roles, and quick start.', group: 'Section', icon: 'i-lucide-layout-dashboard', keywords: 'home introduction getting started welcome' },
  { section: 'manual', title: 'User Manual', description: 'Feature usage, daily operational workflows, and guidance for every KNetraHub page.', group: 'Section', icon: 'i-lucide-book-open', keywords: 'guides how to features' },
  { section: 'configuration', title: 'Configuration', description: 'System options, integrations, authentication providers, and setup guides.', group: 'Section', icon: 'i-lucide-sliders-horizontal', keywords: 'setup env vars settings install' },
  { section: 'api', title: 'API Reference', description: 'REST endpoints grouped by module, with the interactive Swagger explorer.', group: 'Section', icon: 'i-lucide-braces', keywords: 'rest swagger openapi endpoints' },
  { section: 'home', anchor: 'home-capabilities', title: 'Core capabilities', description: 'Stack management, service control, live monitoring, alerts, access control, infrastructure, and the REST API.', group: 'Overview', icon: 'i-lucide-sparkles' },
  { section: 'home', anchor: 'home-modules', title: 'Modules in this portal', description: 'Docker, Network, Server, and IP Management apps behind one portal.', group: 'Overview', icon: 'i-lucide-layout-grid' },
  { section: 'home', anchor: 'home-architecture', title: 'Technology stack & roles', description: 'Runtime, database, live events, and auth architecture, plus the viewer / operator / admin access model.', group: 'Overview', icon: 'i-lucide-cpu', keywords: techStack.map(([k, v]) => `${k} ${v}`).join(' ') },
  { section: 'home', anchor: 'home-quickstart', title: 'Quick start', description: 'Copy the env file, set required vars, mount the Docker socket, and start the app.', group: 'Overview', icon: 'i-lucide-rocket', keywords: 'docker compose install setup .env getting started' },
  ...appFeatures.map((f) => ({ section: 'home', anchor: 'home-capabilities', title: f.title, description: f.desc, group: 'Overview', icon: f.icon })),
  ...modules.map((m) => ({ section: 'home', anchor: 'home-modules', title: `${m.name} module`, description: m.desc, group: 'Overview', icon: m.icon, keywords: `${m.tagline} ${m.points.join(' ')}` })),
  ...manualGroups.flatMap((group) => group.guides.map((g) => ({ section: 'manual', anchor: g.id, title: g.title, description: g.summary, group: group.eyebrow, icon: g.icon }))),
  ...workflows.map((wf) => ({ section: 'manual', anchor: 'workflows', title: wf.title, description: wf.steps.join(' '), group: 'Common workflows', icon: wf.icon })),
  ...configModuleGroups.flatMap((cg) => configGuidesFor(cg.id).map((g) => ({ section: 'configuration', anchor: g.id, title: g.title, description: g.summary, group: cg.eyebrow, icon: g.icon, keywords: [...g.env, ...g.options.map((o) => o[0])].join(' ') }))),
  { section: 'configuration', anchor: 'provider-guides', title: 'Keycloak & Authentik provider guides', description: 'Step-by-step OIDC setup on the provider side and in KNetraHub, plus authentication troubleshooting.', group: 'General · Authentication', icon: 'i-lucide-anchor', keywords: 'sso oidc redirect_uri discovery groups claim troubleshooting invalid client' },
  ...apiGroups.flatMap((g) => [
    { section: 'api', anchor: g.id, title: g.label, description: g.desc, group: 'API Reference', icon: g.icon, keywords: g.endpoints.map((ep) => `${ep[0]} ${ep[1]} ${ep[2]}`).join(' ') },
    ...g.endpoints.map((ep) => ({ section: 'api', anchor: g.id, title: `${ep[0]} ${ep[1]}`, description: ep[2], group: g.label, icon: 'i-lucide-braces' }))
  ])
]

// ── Page state ────────────────────────────────────────────────────────────────
const activeSection = ref('home')
const mainRef = ref<HTMLElement | null>(null)
const mobileOpen = ref(false)

// ── Overview animations ───────────────────────────────────────────────────────
const homeRef = ref<HTMLElement | null>(null)
const revealReady = ref(false)
let revealObserver: IntersectionObserver | null = null

const heroStats = [
  { label: 'App modules', target: modules.length, suffix: '' },
  { label: 'How-to guides', target: manualGroups.reduce((n, g) => n + g.guides.length, 0) + workflows.length, suffix: '' },
  { label: 'Config topics', target: configModuleGroups.reduce((n, g) => n + configGuidesFor(g.id).length, 0), suffix: '' },
  { label: 'API endpoints', target: apiGroups.reduce((n, g) => n + g.endpoints.length, 0), suffix: '+' }
]
const statValues = ref(heroStats.map(() => 0))

let statsAnimated = false
function runStatsCountUp() {
  if (statsAnimated) return
  statsAnimated = true
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  heroStats.forEach((stat, i) => {
    if (reduceMotion) {
      statValues.value[i] = stat.target
      return
    }
    const start = performance.now()
    const duration = 900 + i * 180
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      statValues.value[i] = Math.round(stat.target * eased)
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

// Deterministic particle placement so SSR and client render identically.
function particleStyle(n: number) {
  const size = 2 + (n % 3)
  const duration = 7 + (n % 5) * 1.8
  return {
    left: `${((n * 137.5) % 100).toFixed(1)}%`,
    top: `${(8 + ((n * 53) % 82)).toFixed(1)}%`,
    width: `${size}px`,
    height: `${size}px`,
    opacity: String(0.2 + (n % 4) * 0.12),
    animationDuration: `${duration.toFixed(1)}s`,
    animationDelay: `-${((n * 1.7) % duration).toFixed(2)}s`
  }
}

function goTo(section: string, anchor?: string) {
  activeSection.value = section
  // On mobile, a main-menu tap keeps the drawer open so the section's
  // sub-menu becomes visible; tapping a sub-item (or a section without
  // sub-items) closes the drawer.
  const hasSubs = navConfig.find((item) => item.id === section)?.subs.length
  if (anchor || !hasSubs) mobileOpen.value = false
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
  }

  // Overview animations: reveal-on-scroll + stat count-up. Gated behind
  // revealReady so the content stays fully visible when JS never runs.
  revealReady.value = true
  if (activeSection.value === 'home') runStatsCountUp()
  nextTick(() => {
    const targets = homeRef.value?.querySelectorAll('.reveal')
    if (!targets?.length) return
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('reveal-in'))
      return
    }
    revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-in')
          revealObserver?.unobserve(entry.target)
        }
      }
    }, { root: mainRef.value, threshold: 0.1 })
    targets.forEach((el) => revealObserver!.observe(el))
  })
})

onBeforeUnmount(() => {
  revealObserver?.disconnect()
})

watch(activeSection, (val) => {
  const base = window.location.pathname + window.location.search
  history.replaceState(null, '', val === 'home' ? base : `${base}#${val}`)
  if (val === 'home') runStatsCountUp()
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
            <KNetraHubLogo variant="icon" class="size-7 transition-opacity group-hover:opacity-80 drop-shadow-[0_4px_12px_rgba(36,150,237,0.3)]" />
            <span class="font-display text-sm font-bold text-foam hidden sm:inline">KNetraHub</span>
          </NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="size-3.5 text-faint hidden sm:block shrink-0" />
          <span class="text-sm font-medium text-muted truncate">Documentation</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <DocsSearch :entries="searchIndex" @navigate="goTo" />
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
      <aside class="docs-sidebar">
        <DocsSidebar
          :nav-config="navConfig"
          :active-section="activeSection"
          @navigate="goTo"
        />
      </aside>

      <!-- Main scrollable content -->
      <main ref="mainRef" class="docs-main">
        <!-- ── HOME ──────────────────────────────────────────────────────── -->
        <div v-show="activeSection === 'home'" ref="homeRef" class="section-wrap section-wrap--home" :class="{ 'reveal-ready': revealReady }">
          <!-- Hero -->
          <div class="home-hero">
            <div class="home-hero-grid" aria-hidden="true" />
            <div class="home-hero-aurora" aria-hidden="true" />
            <div class="home-hero-glow" />
            <div class="home-hero-particles" aria-hidden="true">
              <span v-for="n in 14" :key="n" :style="particleStyle(n)" />
            </div>
            <div class="relative z-10">
              <div class="flex items-start gap-4 mb-5">
                <div class="hero-logo flex items-center justify-center size-14 rounded-2xl bg-beacon/15 ring-2 ring-beacon/30 shrink-0">
                  <KNetraHubLogo variant="icon" class="size-9" />
                </div>
                <div>
                  <div class="hero-in hero-in-1 flex items-center gap-2 mb-1">
                    <span class="text-xs font-bold uppercase tracking-widest text-beacon">KNetraHub</span>
                    <span class="flex items-center gap-1.5 rounded-full bg-beacon/10 px-2 py-0.5 text-[10px] font-semibold text-beacon ring-1 ring-beacon/25">
                      <span class="hero-live-dot" aria-hidden="true" />
                      v1.0
                    </span>
                  </div>
                  <h1 class="hero-in hero-in-2 hero-title font-display text-2xl font-bold leading-tight">Documentation</h1>
                  <p class="hero-in hero-in-3 mt-2 text-sm text-muted max-w-xl leading-relaxed">
                    The self-hosted Docker Swarm management console. Deploy stacks, monitor services, manage infrastructure, and control access — all from a single web interface.
                  </p>
                </div>
              </div>
              <div class="hero-in hero-in-4 flex flex-wrap gap-2.5 mt-4">
                <component
                  :is="card.external ? 'a' : 'button'"
                  v-for="card in homeNavCards"
                  :key="card.id"
                  :href="card.external"
                  :target="card.external ? '_blank' : undefined"
                  :rel="card.external ? 'noopener noreferrer' : undefined"
                  class="home-hero-btn group"
                  @click="card.external ? undefined : goTo(card.id)"
                >
                  <UIcon :name="card.icon" class="size-3.5 text-beacon" />
                  {{ card.label }}
                  <UIcon
                    :name="card.external ? 'i-lucide-external-link' : 'i-lucide-arrow-right'"
                    class="size-3 text-faint group-hover:translate-x-0.5 transition-transform"
                  />
                </component>
              </div>
            </div>
          </div>

          <!-- At-a-glance stats -->
          <div class="home-stats reveal">
            <div
              v-for="(stat, i) in heroStats"
              :key="stat.label"
              class="home-stat stagger-item"
              :style="{ '--stagger-i': i }"
            >
              <span class="home-stat-value">{{ statValues[i] }}<span v-if="stat.suffix" class="text-beacon">{{ stat.suffix }}</span></span>
              <span class="home-stat-label">{{ stat.label }}</span>
            </div>
          </div>

          <!-- Features -->
          <div id="home-capabilities" class="mt-10 scroll-mt-20 reveal">
            <p class="section-eyebrow">Core capabilities</p>
            <h2 class="section-title">What KNetraHub does</h2>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
              <div v-for="(f, fi) in appFeatures" :key="f.title" class="feature-card stagger-item" :style="{ '--stagger-i': fi }">
                <span class="flex size-8 items-center justify-center rounded-lg bg-surface-2 ring-1 ring-hull mb-3">
                  <UIcon :name="f.icon" class="size-4 text-beacon" />
                </span>
                <h3 class="font-display text-sm font-semibold text-foam">{{ f.title }}</h3>
                <p class="mt-1 text-xs text-muted leading-relaxed">{{ f.desc }}</p>
              </div>
            </div>
          </div>

          <!-- Modules -->
          <div id="home-modules" class="mt-10 scroll-mt-20 reveal">
            <p class="section-eyebrow">Apps</p>
            <h2 class="section-title">Modules in this portal</h2>
            <p class="mt-2 text-sm text-muted max-w-2xl">
              KNetraHub bundles several apps behind one portal. Each app has its own User Manual, Configuration, and API session below; portal-wide topics (authentication, users, appearance, alert delivery) live in the <strong class="text-foam font-medium">General</strong> sessions.
            </p>
            <div class="grid gap-4 sm:grid-cols-2 mt-4">
              <div v-for="(m, mi) in modules" :key="m.id" class="module-card stagger-item rounded-xl border border-hull bg-surface p-5 hover:border-beacon/30" :style="{ '--stagger-i': mi }">
                <div class="flex items-start gap-3">
                  <span class="flex size-10 items-center justify-center rounded-lg bg-beacon/10 ring-1 ring-beacon/25 shrink-0">
                    <UIcon :name="m.icon" class="size-5 text-beacon" />
                  </span>
                  <div class="min-w-0">
                    <h3 class="font-display text-base font-semibold text-foam">{{ m.name }}</h3>
                    <p class="text-xs text-faint">{{ m.tagline }}</p>
                  </div>
                </div>
                <p class="mt-3 text-xs text-muted leading-relaxed">{{ m.desc }}</p>
                <ul class="mt-3 grid gap-1">
                  <li v-for="p in m.points" :key="p" class="flex items-center gap-1.5 text-xs text-muted">
                    <UIcon name="i-lucide-check" class="size-3 text-running shrink-0" /> {{ p }}
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Tech stack + roles -->
          <div id="home-architecture" class="mt-10 scroll-mt-20 grid gap-6 lg:grid-cols-2 reveal">
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
          <div id="home-quickstart" class="mt-10 scroll-mt-20 reveal">
            <p class="section-eyebrow">Getting started</p>
            <h2 class="section-title">Quick start</h2>
            <div class="grid gap-3 sm:grid-cols-2 mt-4">
              <div v-for="(step, qi) in quickStart" :key="step.n" class="stagger-item rounded-lg border border-hull bg-surface overflow-hidden" :style="{ '--stagger-i': qi }">
                <div class="flex items-center gap-2.5 px-4 py-2.5 border-b border-hull-soft bg-surface-2">
                  <span class="flex size-5 items-center justify-center rounded-full bg-beacon/15 text-[10px] font-bold text-beacon ring-1 ring-beacon/25">
                    {{ step.n }}
                  </span>
                  <span class="text-xs font-semibold text-foam">{{ step.title }}</span>
                </div>
                <pre class="quick-code px-4 py-3 text-xs font-mono text-muted whitespace-pre-wrap leading-relaxed">{{ step.code }}</pre>
              </div>
            </div>
          </div>

          <!-- Nav cards -->
          <div id="home-explore" class="mt-10 scroll-mt-20 reveal">
            <p class="section-eyebrow">Documentation sections</p>
            <h2 class="section-title">Explore the docs</h2>
            <div class="grid gap-4 sm:grid-cols-3 mt-4">
              <component
                :is="card.external ? 'a' : 'button'"
                v-for="(card, ci) in homeNavCards"
                :key="card.id"
                :href="card.external"
                :target="card.external ? '_blank' : undefined"
                :rel="card.external ? 'noopener noreferrer' : undefined"
                class="doc-nav-card stagger-item group"
                :style="{ '--stagger-i': ci }"
                @click="card.external ? undefined : goTo(card.id)"
              >
                <span class="flex size-10 items-center justify-center rounded-lg bg-abyss ring-1 ring-hull mb-3">
                  <UIcon :name="card.icon" class="size-5 text-beacon" />
                </span>
                <div class="flex items-start justify-between gap-2">
                  <h3 class="font-display text-base font-semibold text-foam">{{ card.label }}</h3>
                  <UIcon
                    :name="card.external ? 'i-lucide-external-link' : 'i-lucide-arrow-right'"
                    class="size-4 text-faint mt-0.5 group-hover:translate-x-0.5 transition-transform shrink-0"
                  />
                </div>
                <p class="mt-1.5 text-xs text-muted leading-relaxed">{{ card.desc }}</p>
              </component>
            </div>
          </div>

        </div>

        <!-- ── USER MANUAL ──────────────────────────────────────────────── -->
        <div v-show="activeSection === 'manual'" class="section-wrap">
          <div class="mb-8">
            <p class="section-eyebrow">Guides</p>
            <h1 class="section-h1">User Manual</h1>
            <p class="mt-2 text-sm text-muted max-w-2xl">Feature usage, daily operational workflows, and guidance for every KNetraHub page.</p>
          </div>

          <div class="space-y-10">
            <section
              v-for="group in manualGroups"
              :id="group.id"
              :key="group.id"
              class="space-y-4 scroll-mt-20"
            >
              <div class="flex items-center gap-2.5">
                <span class="flex size-9 items-center justify-center rounded-lg bg-beacon/10 ring-1 ring-beacon/25 shrink-0">
                  <UIcon :name="group.icon" class="size-4 text-beacon" />
                </span>
                <div>
                  <p class="section-eyebrow">{{ group.eyebrow }}</p>
                  <h2 class="section-title">{{ group.label }}</h2>
                </div>
              </div>
              <p class="max-w-2xl text-sm text-muted">{{ group.summary }}</p>

              <div class="grid gap-6">
                <article
                  v-for="feature in group.guides"
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
              v-for="group in configModuleGroups"
              :id="group.id"
              :key="group.id"
              class="space-y-4 scroll-mt-20"
            >
              <div>
                <p class="section-eyebrow">{{ group.eyebrow }}</p>
                <h2 class="section-title">{{ group.title }}</h2>
                <p class="mt-2 max-w-3xl text-sm text-muted">{{ group.summary }}</p>
              </div>

              <div class="grid gap-4">
                <article
                  v-for="guide in configGuidesFor(group.id)"
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
                      <template v-if="guide.env?.length">
                        <p class="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-faint">Related env vars</p>
                        <div class="flex flex-wrap gap-2">
                          <code v-for="key in guide.env" :key="key" class="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs text-beacon ring-1 ring-hull">
                            {{ key }}
                          </code>
                        </div>
                      </template>
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
                  KNetraHub validates ID tokens using the provider discovery document and JWKS, then maps the configured groups claim to viewer, operator, or admin.
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
                      In KNetraHub, use the issuer value only. The discovery path is added automatically.
                    </div>
                  </div>
                </figure>
              </div>

              <div class="grid gap-5 lg:grid-cols-2">
                <article class="space-y-4">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-anchor" class="size-4 text-beacon" />
                    <h3 class="font-display text-lg font-semibold text-foam">KNetraHub side</h3>
                  </div>
                  <ol class="space-y-3 text-sm text-muted">
                    <li v-for="step in knetrahubSteps" :key="step.title">
                      <p class="font-medium text-foam">{{ step.title }}</p>
                      <p class="mt-1">{{ step.body }}</p>
                    </li>
                  </ol>
                </article>
                <figure class="doc-shot">
                  <div class="shot-toolbar"><span /><span /><span /><p>KNetraHub OIDC settings</p></div>
                  <div class="shot-body">
                    <div class="flex items-center justify-between">
                      <p class="text-sm font-semibold text-foam">OIDC single sign-on</p>
                      <span class="rounded-md bg-running/10 px-2 py-1 text-xs font-medium text-running">Enabled</span>
                    </div>
                    <div class="mt-3 space-y-2">
                      <div v-for="[lbl, val] in knetrahubOidcValues" :key="lbl" class="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-xs">
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

        </div>

        <!-- ── API REFERENCE ────────────────────────────────────────────── -->
        <div v-show="activeSection === 'api'" class="section-wrap">
          <div class="mb-8">
            <p class="section-eyebrow">Reference</p>
            <h1 class="section-h1">API Reference</h1>
            <p class="mt-2 text-sm text-muted max-w-2xl">REST endpoints grouped by module. Authenticate with an API token, then use the interactive explorer to try requests.</p>
          </div>

          <!-- Auth + explorer callout (general / portal-wide) -->
          <div class="mb-8 rounded-lg border border-hull bg-surface p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-start gap-3">
              <span class="flex size-10 items-center justify-center rounded-lg bg-beacon/10 ring-1 ring-beacon/25 shrink-0">
                <UIcon name="i-lucide-braces" class="size-5 text-beacon" />
              </span>
              <div>
                <p class="font-display text-base font-semibold text-foam">Interactive explorer</p>
                <p class="mt-1 text-xs text-muted max-w-md">
                  Full request/response schemas and try-it-out for the Docker/core API. Authorize with a token from
                  Preferences → API Tokens (sent as <code class="font-mono text-beacon">Authorization: Bearer …</code>).
                </p>
              </div>
            </div>
            <a :href="swaggerUrl" target="_blank" rel="noopener noreferrer" class="home-hero-btn group shrink-0">
              <UIcon name="i-lucide-external-link" class="size-3.5 text-beacon" /> Open Swagger UI
            </a>
          </div>

          <!-- Per-module endpoint groups -->
          <div class="space-y-8">
            <section v-for="g in apiGroups" :id="g.id" :key="g.id" class="space-y-3 scroll-mt-20">
              <div class="flex items-center gap-2">
                <span class="flex size-9 items-center justify-center rounded-lg bg-surface-2 ring-1 ring-hull shrink-0">
                  <UIcon :name="g.icon" class="size-4 text-beacon" />
                </span>
                <h2 class="section-title">{{ g.label }}</h2>
              </div>
              <p class="max-w-3xl text-sm text-muted">{{ g.desc }}</p>
              <div class="overflow-hidden rounded-lg border border-hull bg-surface">
                <div
                  v-for="(ep, i) in g.endpoints"
                  :key="i"
                  class="flex items-center gap-3 px-4 py-2.5"
                  :class="i ? 'border-t border-hull-soft' : ''"
                >
                  <span class="api-method shrink-0" :class="`api-method--${ep[0].toLowerCase()}`">{{ ep[0] }}</span>
                  <code class="font-mono text-xs text-foam shrink-0">{{ ep[1] }}</code>
                  <span class="ml-auto text-right text-xs text-muted">{{ ep[2] }}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>

    <!-- ── Global fixed footer ───────────────────────────────────────────── -->
    <footer class="docs-global-footer">
      <div class="docs-global-footer-inner">
        <p class="text-xs text-faint flex items-center gap-1 whitespace-nowrap shrink-0">
          <span class="hidden sm:inline">Made with</span>
          <span class="text-running">&#9829;</span>
          <span class="hidden sm:inline">by</span>
          <a
            href="https://github.com/sengphirum"
            target="_blank"
            rel="noopener noreferrer"
            class="font-semibold text-beacon hover:text-foam transition-colors flex items-center gap-1 ml-0.5"
          >
            <UIcon name="i-lucide-github" class="size-3.5" />
            Seng Phirum
          </a>
        </p>
      </div>
    </footer>
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
  flex: 1;
  height: calc(100dvh - 52px - 44px);
  overflow: hidden;
}

@media (min-width: 1024px) {
  .docs-body { padding-left: 220px; }
}

.docs-sidebar {
  display: none;
  width: 220px;
  overflow-y: auto;
  border-right: 1px solid var(--color-hull-soft);
  background: var(--color-abyss);
  scrollbar-width: thin;
  scrollbar-color: var(--color-hull) transparent;
}

@media (min-width: 1024px) {
  .docs-sidebar {
    display: block;
    position: fixed;
    top: 52px;
    left: 0;
    bottom: 44px;
    width: 220px;
    z-index: 20;
  }
}

.docs-main {
  height: 100%;
  min-width: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-hull) transparent;
}

/* ── Global fixed footer ──────────────────────────────────────────────────── */
.docs-global-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 44px;
  z-index: 25;
  border-top: 1px solid var(--color-hull-soft);
  background: color-mix(in srgb, var(--color-abyss) 92%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.docs-global-footer-inner {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  padding: 0 1.25rem;
  gap: 1rem;
}

/* ── Section wrappers ─────────────────────────────────────────────────────── */
.section-wrap {
  padding: 2rem 1.5rem 5rem;
  width: 100%;
}

.section-wrap--home {
  max-width: 1100px;
}

@media (min-width: 768px) {
  .section-wrap { padding: 2.5rem 2.5rem 5rem; }
}

@media (min-width: 1280px) {
  .section-wrap { padding: 2.75rem 3rem 5rem; }
}

/* Slightly larger base prose text inside doc sections */
.section-wrap p,
.section-wrap li span,
.section-wrap ol li { font-size: 0.9375rem; }

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
  position: relative;
  overflow: hidden;
  padding: 1.125rem;
  border-radius: 0.75rem;
  border: 1px solid var(--color-hull);
  background: var(--color-surface);
  transition: border-color 0.15s, background 0.15s, transform 0.2s, box-shadow 0.2s;
}

.feature-card:hover {
  border-color: color-mix(in srgb, var(--color-beacon) 30%, transparent);
  background: var(--color-surface-2);
  transform: translateY(-2px);
  box-shadow: 0 10px 30px -14px color-mix(in srgb, var(--color-beacon) 35%, transparent);
}

/* Scanning light sweep across the card's top edge on hover */
.feature-card::after {
  content: '';
  position: absolute;
  top: 0;
  left: -70%;
  height: 1.5px;
  width: 60%;
  background: linear-gradient(90deg, transparent, var(--color-beacon), transparent);
  transition: left 0.45s ease;
}

.feature-card:hover::after { left: 110%; }

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

/* ── API method badges ────────────────────────────────────────────────────── */
.api-method {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0.15rem 0.45rem;
  border-radius: 0.3rem;
  min-width: 3.4rem;
  text-align: center;
}

.api-method--get    { background: color-mix(in srgb, #10b981 16%, transparent); color: #34d399; }
.api-method--post   { background: color-mix(in srgb, #3b82f6 16%, transparent); color: #60a5fa; }
.api-method--put    { background: color-mix(in srgb, #f59e0b 16%, transparent); color: #fbbf24; }
.api-method--delete { background: color-mix(in srgb, #ef4444 16%, transparent); color: #f87171; }
.api-method--patch  { background: color-mix(in srgb, #06b6d4 16%, transparent); color: #38bdf8; }

/* ── Overview: animated hero layers ───────────────────────────────────────── */
.home-hero-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(color-mix(in srgb, var(--color-beacon) 7%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--color-beacon) 7%, transparent) 1px, transparent 1px);
  background-size: 26px 26px;
  mask-image: radial-gradient(ellipse 85% 95% at 28% 18%, black 25%, transparent 78%);
  -webkit-mask-image: radial-gradient(ellipse 85% 95% at 28% 18%, black 25%, transparent 78%);
  animation: grid-pan 26s linear infinite;
}

@keyframes grid-pan {
  to { background-position: 26px 26px; }
}

.home-hero-aurora {
  position: absolute;
  inset: -60% -30%;
  pointer-events: none;
  background:
    radial-gradient(ellipse 30% 40% at 70% 30%, color-mix(in srgb, var(--color-beacon) 14%, transparent), transparent 70%),
    radial-gradient(ellipse 25% 35% at 30% 70%, color-mix(in srgb, var(--color-running) 9%, transparent), transparent 70%);
  filter: blur(46px);
  animation: aurora-drift 16s ease-in-out infinite alternate;
}

@keyframes aurora-drift {
  from { transform: translate3d(-4%, -2%, 0) rotate(-2deg) scale(1); }
  to   { transform: translate3d(4%, 3%, 0) rotate(2deg) scale(1.08); }
}

.home-hero-particles {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.home-hero-particles span {
  position: absolute;
  border-radius: 999px;
  background: var(--color-beacon);
  box-shadow: 0 0 6px 1px color-mix(in srgb, var(--color-beacon) 55%, transparent);
  animation: particle-float ease-in-out infinite;
}

@keyframes particle-float {
  0%, 100% { transform: translate3d(0, 0, 0); }
  25%      { transform: translate3d(6px, -14px, 0); }
  50%      { transform: translate3d(-4px, -26px, 0); }
  75%      { transform: translate3d(-10px, -10px, 0); }
}

/* ── Overview: hero content entrance + accents ────────────────────────────── */
.hero-in { animation: hero-rise 0.65s cubic-bezier(0.22, 1, 0.36, 1) both; }
.hero-in-1 { animation-delay: 0.05s; }
.hero-in-2 { animation-delay: 0.12s; }
.hero-in-3 { animation-delay: 0.2s; }
.hero-in-4 { animation-delay: 0.3s; }

@keyframes hero-rise {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

.hero-logo {
  box-shadow: 0 0 24px -6px color-mix(in srgb, var(--color-beacon) 45%, transparent);
  animation: logo-float 6s ease-in-out infinite;
}

@keyframes logo-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-5px); }
}

.hero-title { color: var(--color-foam); }

@supports ((background-clip: text) or (-webkit-background-clip: text)) {
  .hero-title {
    background: linear-gradient(100deg, var(--color-foam) 0%, var(--color-foam) 35%, var(--color-beacon) 50%, var(--color-foam) 65%, var(--color-foam) 100%);
    background-size: 220% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: hero-rise 0.65s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both, hero-shimmer 6s ease-in-out 1s infinite;
  }
}

@keyframes hero-shimmer {
  0%, 100% { background-position: 0% 0; }
  50%      { background-position: 100% 0; }
}

.hero-live-dot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--color-running);
  animation: live-pulse 2.2s ease-out infinite;
}

@keyframes live-pulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-running) 55%, transparent); }
  70%  { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

/* ── Overview: at-a-glance stats ──────────────────────────────────────────── */
.home-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 1.25rem;
}

@media (min-width: 640px) {
  .home-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

.home-stat {
  position: relative;
  overflow: hidden;
  padding: 0.9rem 1rem;
  border-radius: 0.75rem;
  border: 1px solid var(--color-hull);
  background: var(--color-surface);
}

.home-stat::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, var(--color-beacon), transparent 60%);
  opacity: 0.5;
}

.home-stat-value {
  display: block;
  font-family: var(--font-mono);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--color-foam);
  font-variant-numeric: tabular-nums;
}

.home-stat-label {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-faint);
}

/* ── Overview: module card hover lift ─────────────────────────────────────── */
.module-card {
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}

.module-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 34px -16px color-mix(in srgb, var(--color-beacon) 40%, transparent);
}

/* ── Overview: quick-start terminal caret ─────────────────────────────────── */
.quick-code::after {
  content: '▊';
  margin-left: 2px;
  color: var(--color-beacon);
  animation: caret-blink 1.1s steps(2, start) infinite;
}

@keyframes caret-blink {
  50% { opacity: 0; }
}

/* ── Overview: reveal-on-scroll ───────────────────────────────────────────── */
/* Hidden states only apply once JS has set reveal-ready, so content stays
   visible when scripts never run (static export, reader mode, etc.). */
.reveal-ready .reveal {
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.reveal-ready .reveal.reveal-in {
  opacity: 1;
  transform: translateY(0);
}

.reveal-ready .stagger-item {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 0.5s ease, transform 0.5s ease;
  transition-delay: calc(60ms * var(--stagger-i, 0));
}

.reveal-ready .reveal-in .stagger-item,
.reveal-ready .reveal-in.stagger-item {
  opacity: 1;
  transform: translateY(0);
}

/* ── Overview: reduced motion ─────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .home-hero-grid,
  .home-hero-aurora,
  .home-hero-particles span,
  .hero-logo,
  .hero-live-dot,
  .hero-in,
  .hero-title,
  .quick-code::after {
    animation: none !important;
  }

  .reveal-ready .reveal,
  .reveal-ready .stagger-item {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
  }

  .feature-card,
  .feature-card:hover,
  .module-card:hover {
    transform: none;
  }

  .feature-card::after { display: none; }
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
</style>
