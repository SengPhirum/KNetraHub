<script setup lang="ts">
definePageMeta({
  middleware: [
    function () {
      const { can } = useAuth()
      if (!can('admin')) return navigateTo('/')
    }
  ]
})

const config = useRuntimeConfig()
const { data: gl } = useFetch('/api/gitlab/status', { lazy: true })

const ldapEnabled = computed(() => config.public.ldapEnabled)

const envVars = [
  { k: 'NUXT_JWT_SECRET',                      d: 'Secret for signing session tokens (required in production)' },
  { k: 'NUXT_DOCKER_SOCKET_PATH',               d: 'Path to Docker socket (default /var/run/docker.sock)' },
  { k: 'NUXT_DOCKER_HOST / NUXT_DOCKER_PORT',   d: 'Remote Docker engine over TCP (overrides socket)' },
  { k: 'NUXT_DOCKER_CA / CERT / KEY',           d: 'TLS certificate chain for mutual-TLS remote Docker' },
  { k: 'NUXT_LDAP_ENABLED',                     d: 'Set "true" to enable LDAP / AD authentication' },
  { k: 'NUXT_LDAP_URL',                         d: 'e.g. ldaps://ldap.example.com:636' },
  { k: 'NUXT_LDAP_BIND_DN / BIND_CREDENTIALS',  d: 'Service account credentials for directory search' },
  { k: 'NUXT_LDAP_SEARCH_BASE',                 d: 'Base DN for user lookups' },
  { k: 'NUXT_LDAP_ADMIN_GROUP / OPERATOR_GROUP', d: 'Group DNs mapped to DockHub roles' },
  { k: 'NUXT_GITLAB_TOKEN',                     d: 'Personal/project access token with api scope' },
  { k: 'NUXT_GITLAB_PROJECT_ID',                d: 'Numeric project ID where compose files are stored' },
  { k: 'NUXT_GITLAB_BRANCH / STACKS_PATH',      d: 'Branch (default: main) and folder (default: stacks)' },
  { k: 'NUXT_DATA_DIR',                         d: 'Directory for the SQLite database (default: ./.data)' },
  { k: 'NUXT_PUBLIC_APP_NAME',                  d: 'Displayed as the app name in the header' }
]
</script>

<template>
  <div>
    <PageHeader title="System settings" subtitle="Infrastructure, integrations, and configuration reference" icon="i-lucide-settings" />

    <div class="space-y-6 max-w-2xl">

      <!-- ── Integrations ───────────────────────────────────────────────────── -->
      <section>
        <h2 class="mb-3 text-xs font-semibold uppercase tracking-widest text-faint">Integrations</h2>

        <div class="grid gap-4 sm:grid-cols-2">
          <!-- GitLab -->
          <div class="panel p-5">
            <h3 class="font-display text-sm font-semibold text-foam mb-3 flex items-center gap-2">
              <UIcon name="i-lucide-git-branch" class="size-4 text-beacon" /> GitLab
            </h3>
            <div class="flex items-center gap-2 mb-3">
              <span class="dot" :class="gl?.enabled ? 'dot-running' : 'dot-idle'" />
              <span class="text-sm" :class="gl?.enabled ? 'status-running' : 'text-(--color-muted)'">
                {{ gl?.enabled ? 'Connected' : 'Not configured' }}
              </span>
            </div>
            <dl v-if="gl?.enabled" class="space-y-1.5 text-sm">
              <div class="flex justify-between gap-3">
                <dt class="text-faint">Project</dt>
                <dd class="font-mono text-(--color-muted)">{{ gl.projectId }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-faint">Branch</dt>
                <dd class="font-mono text-(--color-muted)">{{ gl.branch }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-faint">Path</dt>
                <dd class="font-mono text-(--color-muted)">{{ gl.stacksPath }}/</dd>
              </div>
            </dl>
            <p v-else class="text-xs text-faint">Set the <code class="font-mono text-beacon">NUXT_GITLAB_*</code> env vars to enable compose file versioning and rollbacks.</p>
          </div>

          <!-- LDAP -->
          <div class="panel p-5">
            <h3 class="font-display text-sm font-semibold text-foam mb-3 flex items-center gap-2">
              <UIcon name="i-lucide-building-2" class="size-4 text-beacon" /> LDAP / Active Directory
            </h3>
            <div class="flex items-center gap-2 mb-3">
              <span class="dot" :class="ldapEnabled ? 'dot-running' : 'dot-idle'" />
              <span class="text-sm" :class="ldapEnabled ? 'status-running' : 'text-(--color-muted)'">
                {{ ldapEnabled ? 'Enabled' : 'Disabled — local auth only' }}
              </span>
            </div>
            <p class="text-xs text-faint">When enabled, login attempts LDAP first then falls back to local accounts. Group membership maps to DockHub roles.</p>
          </div>
        </div>
      </section>

      <!-- ── Configuration reference ───────────────────────────────────────── -->
      <section>
        <h2 class="mb-3 text-xs font-semibold uppercase tracking-widest text-faint">Configuration reference</h2>

        <div class="panel p-5">
          <p class="text-xs text-(--color-muted) mb-4">
            DockHub is configured entirely via environment variables. Restart the server after changing them.
          </p>
          <div class="space-y-0">
            <div
              v-for="e in envVars" :key="e.k"
              class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-2 border-b border-hull/40 last:border-0"
            >
              <code class="font-mono text-xs text-beacon sm:w-80 shrink-0">{{ e.k }}</code>
              <span class="text-xs text-(--color-muted)">{{ e.d }}</span>
            </div>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>
