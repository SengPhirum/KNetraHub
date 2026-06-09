<script setup lang="ts">
const { user, can } = useAuth()
const toast = useToast()
const config = useRuntimeConfig()
const { data: gl } = await useFetch('/api/gitlab/status', { lazy: true })

const ldapEnabled = computed(() => config.public.ldapEnabled)

// change own password (local admins can call the users endpoint on themselves)
const pwd = reactive({ a: '', b: '' })
const saving = ref(false)
const canChangePassword = computed(() => user.value?.source === 'local' && can('admin'))
async function changePassword() {
  if (!pwd.a || pwd.a !== pwd.b) { toast.add({ title: 'Passwords do not match', color: 'warning' }); return }
  saving.value = true
  try {
    await $fetch(`/api/users/${user.value!.id}`, { method: 'PATCH', body: { password: pwd.a } })
    toast.add({ title: 'Password changed', color: 'primary', icon: 'i-lucide-key-round' })
    pwd.a = ''; pwd.b = ''
  } catch (e: any) { toast.add({ title: 'Change failed', description: e?.data?.statusMessage, color: 'error' }) } finally { saving.value = false }
}

const envVars = [
  { k: 'NUXT_JWT_SECRET', d: 'Secret for signing session tokens (set a long random value)' },
  { k: 'NUXT_DOCKER_SOCKET_PATH', d: 'Path to Docker socket (default /var/run/docker.sock)' },
  { k: 'NUXT_DOCKER_HOST / PORT', d: 'Remote Docker engine over TCP (alternative to socket)' },
  { k: 'NUXT_LDAP_ENABLED', d: 'Set "true" to enable LDAP authentication' },
  { k: 'NUXT_LDAP_URL', d: 'e.g. ldaps://ldap.example.com:636' },
  { k: 'NUXT_LDAP_BIND_DN / BIND_CREDENTIALS', d: 'Service account for directory search' },
  { k: 'NUXT_LDAP_SEARCH_BASE', d: 'Base DN for user lookups' },
  { k: 'NUXT_LDAP_ADMIN_GROUP / OPERATOR_GROUP', d: 'Group DNs mapped to roles' },
  { k: 'NUXT_GITLAB_TOKEN', d: 'Personal/project access token with api scope' },
  { k: 'NUXT_GITLAB_PROJECT_ID', d: 'Numeric project ID storing compose files' },
  { k: 'NUXT_GITLAB_BRANCH / STACKS_PATH', d: 'Branch (default main) and folder (default stacks)' }
]
</script>

<template>
  <div>
    <PageHeader title="Settings" subtitle="Integration status and your account" icon="i-lucide-settings" />

    <div class="grid gap-4 lg:grid-cols-2 mb-5">
      <div class="panel p-4">
        <h3 class="font-display text-sm font-semibold text-[var(--color-foam)] mb-3 flex items-center gap-2"><UIcon name="i-lucide-git-branch" class="size-4 text-[var(--color-beacon)]" /> GitLab</h3>
        <div class="flex items-center gap-2 mb-3">
          <span class="dot" :class="gl?.enabled ? 'dot-running' : 'dot-idle'" />
          <span class="text-sm" :class="gl?.enabled ? 'text-emerald-300' : 'text-[var(--color-muted)]'">{{ gl?.enabled ? 'Connected' : 'Not configured' }}</span>
        </div>
        <dl v-if="gl?.enabled" class="space-y-1.5 text-sm">
          <div class="flex justify-between gap-3"><dt class="text-[var(--color-faint)]">Project</dt><dd class="font-mono text-[var(--color-muted)]">{{ gl.projectId }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-[var(--color-faint)]">Branch</dt><dd class="font-mono text-[var(--color-muted)]">{{ gl.branch }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-[var(--color-faint)]">Path</dt><dd class="font-mono text-[var(--color-muted)]">{{ gl.stacksPath }}/</dd></div>
        </dl>
        <p v-else class="text-xs text-[var(--color-faint)]">Set the GitLab env vars to version stack compose files and enable rollbacks.</p>
      </div>

      <div class="panel p-4">
        <h3 class="font-display text-sm font-semibold text-[var(--color-foam)] mb-3 flex items-center gap-2"><UIcon name="i-lucide-users" class="size-4 text-[var(--color-beacon)]" /> LDAP</h3>
        <div class="flex items-center gap-2">
          <span class="dot" :class="ldapEnabled ? 'dot-running' : 'dot-idle'" />
          <span class="text-sm" :class="ldapEnabled ? 'text-emerald-300' : 'text-[var(--color-muted)]'">{{ ldapEnabled ? 'Enabled' : 'Disabled — local auth only' }}</span>
        </div>
        <p class="mt-3 text-xs text-[var(--color-faint)]">When enabled, login tries LDAP first and falls back to local accounts. Group membership maps to DockHub roles.</p>
      </div>
    </div>

    <div class="panel p-4 mb-5">
      <h3 class="font-display text-sm font-semibold text-[var(--color-foam)] mb-1 flex items-center gap-2"><UIcon name="i-lucide-user" class="size-4 text-[var(--color-beacon)]" /> Your account</h3>
      <p class="text-sm text-[var(--color-muted)] mb-4">{{ user?.displayName }} · <span class="font-mono text-xs">{{ user?.username }}</span> · <span class="capitalize">{{ user?.role }}</span> · {{ user?.source }}</p>
      <div v-if="canChangePassword" class="grid gap-3 sm:grid-cols-2 max-w-md">
        <UFormField label="New password"><UInput v-model="pwd.a" type="password" class="w-full" :disabled="saving" /></UFormField>
        <UFormField label="Confirm"><UInput v-model="pwd.b" type="password" class="w-full" :disabled="saving" /></UFormField>
        <div class="sm:col-span-2"><UButton color="primary" label="Change password" icon="i-lucide-key-round" :loading="saving" @click="changePassword" /></div>
      </div>
      <p v-else class="text-xs text-[var(--color-faint)]">
        {{ user?.source === 'ldap' ? 'Your password is managed by your LDAP directory.' : 'Ask an administrator to change your password.' }}
      </p>
    </div>

    <div class="panel p-4">
      <h3 class="font-display text-sm font-semibold text-[var(--color-foam)] mb-3 flex items-center gap-2"><UIcon name="i-lucide-terminal" class="size-4 text-[var(--color-beacon)]" /> Configuration reference</h3>
      <p class="text-xs text-[var(--color-muted)] mb-3">DockHub is configured entirely through environment variables. Restart after changing them.</p>
      <div class="space-y-1.5">
        <div v-for="e in envVars" :key="e.k" class="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-1.5 border-b border-[var(--color-hull)]/50 last:border-0">
          <code class="font-mono text-xs text-[var(--color-beacon)] sm:w-72 shrink-0">{{ e.k }}</code>
          <span class="text-xs text-[var(--color-muted)]">{{ e.d }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
