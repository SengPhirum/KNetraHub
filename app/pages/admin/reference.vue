<script setup lang="ts">
// Admin > General > Reference. Environment-variable reference. Env vars provide
// defaults; saved settings override them until reset. Was a tab in old /settings.
definePageMeta({ middleware: 'admin' })

const envVars = [
  { k: 'NUXT_JWT_SECRET', d: 'Secret for signing session tokens (required in production)' },
  { k: 'NUXT_DOCKER_SOCKET_PATH', d: 'Path to Docker socket (default /var/run/docker.sock)' },
  { k: 'NUXT_DOCKER_HOST / NUXT_DOCKER_PORT', d: 'Remote Docker engine over TCP (overrides socket)' },
  { k: 'NUXT_DOCKER_CA / CERT / KEY', d: 'TLS certificate chain for mutual-TLS remote Docker' },
  { k: 'NUXT_LOCAL_AUTH_HIDE_LOGIN', d: 'Hide the local form on /login; /login?local=1 always reveals recovery sign-in' },
  { k: 'NUXT_LOCAL_AUTH_SESSION_TIMEOUT_MINUTES', d: 'Absolute browser session lifetime (default: 720 minutes / 12 hours)' },
  { k: 'NUXT_LOCAL_AUTH_PASSWORD_MIN_LENGTH', d: 'Minimum new local password length (default: 8; range: 8–128)' },
  { k: 'NUXT_LOCAL_AUTH_PASSWORD_REQUIRE_UPPERCASE / LOWERCASE', d: 'Require upper/lowercase letters in new local passwords' },
  { k: 'NUXT_LOCAL_AUTH_PASSWORD_REQUIRE_NUMBER / SPECIAL', d: 'Require a number/special character in new local passwords' },
  { k: 'NUXT_LDAP_ENABLED', d: 'Default LDAP / AD authentication state' },
  { k: 'NUXT_LDAP_URL', d: 'e.g. ldaps://ldap.example.com:636' },
  { k: 'NUXT_LDAP_BIND_DN / BIND_CREDENTIALS', d: 'Service account credentials for directory search' },
  { k: 'NUXT_LDAP_SEARCH_BASE', d: 'Base DN for user lookups' },
  { k: 'NUXT_LDAP_SEARCH_FILTER', d: 'User lookup filter (default: (uid={{username}}))' },
  { k: 'NUXT_LDAP_ADMIN_GROUP / OPERATOR_GROUP', d: 'Group DNs mapped to KNetraHub roles' },
  { k: 'NUXT_OIDC_ENABLED', d: 'Default OIDC single sign-on state' },
  { k: 'NUXT_OIDC_ISSUER', d: 'Provider issuer URL; endpoints are discovered automatically' },
  { k: 'NUXT_OIDC_CLIENT_ID / CLIENT_SECRET', d: 'OAuth client registered at the provider' },
  { k: 'NUXT_OIDC_REDIRECT_URI', d: 'Override the callback URL (default: {origin}/api/auth/oidc/callback)' },
  { k: 'NUXT_OIDC_SCOPE', d: 'Requested scopes (default: openid profile email groups)' },
  { k: 'NUXT_OIDC_USERNAME_CLAIM', d: 'Claim used as the KNetraHub username (default: preferred_username)' },
  { k: 'NUXT_OIDC_GROUPS_CLAIM', d: 'Claim carrying group names; dot-paths work (default: groups)' },
  { k: 'NUXT_OIDC_ADMIN_GROUP / OPERATOR_GROUP', d: 'Group names mapped to KNetraHub roles' },
  { k: 'NUXT_OIDC_PROVIDER_NAME', d: 'Label for the SSO login button' },
  { k: 'NUXT_GITLAB_TOKEN', d: 'Personal/project access token with api scope (or configure under Dock -> Settings -> Integrations)' },
  { k: 'NUXT_GITLAB_PROJECT_ID', d: 'Numeric project ID where compose files are stored' },
  { k: 'NUXT_GITLAB_BRANCH / STACKS_PATH', d: 'Branch (default: main) and folder (default: stacks)' },
  { k: 'NUXT_ALERTS_ENABLED', d: 'Default alert poller state (default: true)' },
  { k: 'NUXT_ALERTS_INTERVAL_MINUTES', d: 'How often usage/node/replica/disk conditions are checked (default: 3)' },
  { k: 'NUXT_DB_HOST / PORT / NAME / USER / PASSWORD', d: 'Postgres + TimescaleDB connection (app data and metrics history)' },
  { k: 'NUXT_METRICS_RETENTION_DAYS', d: 'Days of metrics history kept before retention drops it (default: 30)' },
  { k: 'NUXT_PUBLIC_APP_NAME', d: 'Default app name in the header (Admin -> Appearance can override it)' }
]
const envSortOptions = [
  { label: 'Variable', value: 'k' },
  { label: 'Description', value: 'd' }
]
const {
  items: filteredEnvVars,
  search: envSearch,
  sortBy: envSortBy,
  sortDir: envSortDir,
  sortOptions: envSortOptionsState
} = useListControls('settings:env', () => envVars, {
  sortOptions: envSortOptions,
  defaultSortBy: 'k'
})
</script>

<template>
  <div>
    <PageHeader title="Reference" subtitle="Environment variables and their defaults" icon="i-lucide-book-open" />

    <div class="panel p-5">
      <p class="text-xs text-(--color-muted) mb-4">
        Environment variables provide defaults. Saved settings (appearance, authentication, and each app's own admin settings such as Dock's integrations and alerts) are persisted in Postgres and override those defaults until reset.
      </p>
      <ListControls
        v-model:search="envSearch"
        v-model:sort-by="envSortBy"
        v-model:sort-dir="envSortDir"
        :sort-options="envSortOptionsState"
        placeholder="Search environment variables"
      />
      <div class="space-y-0">
        <div
          v-for="e in filteredEnvVars"
          :key="e.k"
          class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-2 border-b border-hull/40 last:border-0"
        >
          <code class="font-mono text-xs text-beacon sm:w-80 shrink-0">{{ e.k }}</code>
          <span class="text-xs text-(--color-muted)">{{ e.d }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
