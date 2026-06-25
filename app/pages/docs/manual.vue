<script setup lang="ts">
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
      label: 'Dashboard',
      status: 'Live',
      metrics: [
        ['Nodes ready', '3/3'],
        ['Services', '12'],
        ['Running tasks', '28'],
        ['Cluster capacity', '24 CPU']
      ],
      rows: [
        ['manager-01', 'Leader', 'Ready'],
        ['worker-01', 'Worker', 'Ready'],
        ['worker-02', 'Worker', 'Ready']
      ]
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
      label: 'Stack detail',
      status: 'Versioned',
      metrics: [
        ['Services', '4'],
        ['Networks', '2'],
        ['Configs', '1'],
        ['Secrets', '3']
      ],
      rows: [
        ['web', 'nginx:1.27', 'Running'],
        ['api', 'registry/app:2026.06', 'Running'],
        ['worker', 'registry/worker:2026.06', 'Pending']
      ]
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
      label: 'Service detail',
      status: 'Running',
      metrics: [
        ['Replicas', '3/3'],
        ['Image', 'app:stable'],
        ['Ports', '443:8443'],
        ['Mode', 'replicated']
      ],
      rows: [
        ['task.1', 'manager-01', 'Running'],
        ['task.2', 'worker-01', 'Running'],
        ['task.3', 'worker-02', 'Running']
      ]
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
      label: 'Task history',
      status: 'Mixed',
      metrics: [
        ['Running', '28'],
        ['Failed', '2'],
        ['Pending', '1'],
        ['Shutdown', '11']
      ],
      rows: [
        ['api.1', 'worker-01', 'Running'],
        ['api.2', 'worker-02', 'Failed'],
        ['web.1', 'manager-01', 'Running']
      ]
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
      label: 'Node list',
      status: 'Healthy',
      metrics: [
        ['Managers', '1'],
        ['Workers', '2'],
        ['CPU total', '24'],
        ['Memory total', '96 GB']
      ],
      rows: [
        ['manager-01', 'Manager leader', 'Ready'],
        ['worker-01', 'Worker', 'Ready'],
        ['worker-02', 'Worker', 'Drain']
      ]
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
      label: 'Resource inventory',
      status: 'Ready',
      metrics: [
        ['Networks', '5'],
        ['Volumes', '9'],
        ['Drivers', '2'],
        ['In use', '11']
      ],
      rows: [
        ['frontend-net', 'overlay', 'Attachable'],
        ['db-data', 'local', 'In use'],
        ['cache-data', 'local', 'Unused']
      ]
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
      label: 'Secret library',
      status: 'Protected',
      metrics: [
        ['Secrets', '6'],
        ['Configs', '4'],
        ['Used', '8'],
        ['Unused', '2']
      ],
      rows: [
        ['api_token', 'secret', 'Write-only'],
        ['nginx_conf', 'config', 'Readable'],
        ['db_password_v2', 'secret', 'In use']
      ]
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
      label: 'Registry access',
      status: 'Admin',
      metrics: [
        ['Registries', '2'],
        ['Private images', '14'],
        ['Expiring soon', '1'],
        ['Last pull', '2 min']
      ],
      rows: [
        ['registry.gitlab.com', 'Deploy token', 'Active'],
        ['ghcr.io', 'Robot account', 'Active'],
        ['registry.local', 'Password', 'Rotate']
      ]
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
      label: 'Access control',
      status: 'Tracked',
      metrics: [
        ['Users', '12'],
        ['Admins', '2'],
        ['Operators', '5'],
        ['Audit entries', '200']
      ],
      rows: [
        ['viewer', 'Read-only', 'Safe'],
        ['operator', 'Workload control', 'Scoped'],
        ['admin', 'Full control', 'Restricted']
      ]
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
      label: 'Authentication',
      status: 'Configurable',
      metrics: [
        ['LDAP', 'Enabled'],
        ['OIDC', 'Ready'],
        ['Overrides', 'DB'],
        ['Fallback', 'Local admin']
      ],
      rows: [
        ['Issuer', 'https://sso.example', 'Set'],
        ['Groups claim', 'groups', 'Mapped'],
        ['Redirect URI', 'Auto', 'Effective']
      ]
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
</script>

<template>
  <div>
    <PageHeader title="User Manual" subtitle="Guides for using each KNetraHub feature and daily workflow" icon="i-lucide-book-open" />

    <div class="grid gap-6 xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
      <aside class="hidden xl:block">
        <nav class="sticky top-24 space-y-5 text-sm">
          <div>
            <p class="mb-2 text-xs font-semibold uppercase tracking-widest text-faint">Features</p>
            <a
              v-for="feature in featureGuides"
              :key="feature.id"
              :href="`#${feature.id}`"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-(--color-muted) hover:bg-(--color-veil) hover:text-foam"
            >
              <UIcon :name="feature.icon" class="size-4 text-faint" />
              {{ feature.title }}
            </a>
          </div>
          <div>
            <p class="mb-2 text-xs font-semibold uppercase tracking-widest text-faint">Workflows</p>
            <a
              v-for="workflow in workflows"
              :key="workflow.title"
              href="#workflows"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-(--color-muted) hover:bg-(--color-veil) hover:text-foam"
            >
              <UIcon :name="workflow.icon" class="size-4 text-faint" />
              {{ workflow.title }}
            </a>
          </div>
        </nav>
      </aside>

      <main class="min-w-0 space-y-10">
        <section class="space-y-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-widest text-faint">Feature usage</p>
            <h2 class="mt-1 font-display text-xl font-semibold text-foam">Daily operation guide</h2>
          </div>

          <div class="grid gap-5">
            <article
              v-for="feature in featureGuides"
              :id="feature.id"
              :key="feature.id"
              class="grid gap-4 scroll-mt-24 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,25rem)] lg:items-start"
            >
              <div class="space-y-3">
                <div class="flex items-center gap-2">
                  <span class="flex size-9 items-center justify-center rounded-lg bg-surface-2 ring-1 ring-hull">
                    <UIcon :name="feature.icon" class="size-4 text-beacon" />
                  </span>
                  <h3 class="font-display text-lg font-semibold text-foam">{{ feature.title }}</h3>
                </div>
                <p class="text-sm text-(--color-muted)">{{ feature.summary }}</p>
                <ol class="space-y-2 text-sm text-(--color-muted)">
                  <li v-for="(step, index) in feature.steps" :key="step" class="flex gap-2">
                    <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-beacon">
                      {{ index + 1 }}
                    </span>
                    <span>{{ step }}</span>
                  </li>
                </ol>
              </div>

              <figure class="doc-shot">
                <div class="shot-toolbar">
                  <span />
                  <span />
                  <span />
                  <p>{{ feature.shot.label }}</p>
                </div>
                <div class="shot-body">
                  <div class="flex items-center justify-between gap-3">
                    <p class="font-display text-sm font-semibold text-foam">{{ feature.shot.label }}</p>
                    <span class="rounded-md bg-running/10 px-2 py-1 text-xs font-medium text-running">{{ feature.shot.status }}</span>
                  </div>
                  <div class="mt-3 grid grid-cols-2 gap-2">
                    <div v-for="[label, value] in feature.shot.metrics" :key="label" class="shot-metric">
                      <p>{{ label }}</p>
                      <strong>{{ value }}</strong>
                    </div>
                  </div>
                  <div class="mt-3 space-y-1.5">
                    <div v-for="[a, b, c] in feature.shot.rows" :key="`${a}-${b}`" class="shot-row">
                      <span class="truncate font-medium text-foam">{{ a }}</span>
                      <span class="truncate text-faint">{{ b }}</span>
                      <span class="justify-self-end rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-(--color-muted)">{{ c }}</span>
                    </div>
                  </div>
                </div>
              </figure>
            </article>
          </div>
        </section>

        <section id="workflows" class="space-y-4 scroll-mt-24">
          <div>
            <p class="text-xs font-semibold uppercase tracking-widest text-faint">Common workflows</p>
            <h2 class="mt-1 font-display text-xl font-semibold text-foam">How to combine the pages</h2>
          </div>
          <div class="grid gap-4 lg:grid-cols-3">
            <article v-for="workflow in workflows" :key="workflow.title" class="rounded-lg border border-hull bg-surface p-5">
              <div class="flex items-center gap-2">
                <UIcon :name="workflow.icon" class="size-4 text-beacon" />
                <h3 class="font-display text-base font-semibold text-foam">{{ workflow.title }}</h3>
              </div>
              <ol class="mt-4 space-y-2 text-sm text-(--color-muted)">
                <li v-for="(step, index) in workflow.steps" :key="step" class="flex gap-2">
                  <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-beacon">
                    {{ index + 1 }}
                  </span>
                  <span>{{ step }}</span>
                </li>
              </ol>
            </article>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
.doc-shot {
  overflow: hidden;
  border: 1px solid var(--color-hull);
  border-radius: 0.75rem;
  background: var(--color-abyss);
  box-shadow: var(--panel-shadow-soft);
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

.shot-body {
  padding: 1rem;
}

.shot-metric {
  min-width: 0;
  border: 1px solid var(--color-hull-soft);
  border-radius: 0.5rem;
  background: var(--color-surface-2);
  padding: 0.65rem;
}

.shot-metric p {
  color: var(--color-faint);
  font-size: 0.68rem;
}

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
</style>
