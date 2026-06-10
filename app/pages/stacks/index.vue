<script setup lang="ts">
const { can } = useAuth()
const { prefs } = usePreferences()
const toast = useToast()

const { data, status, error, refreshing, refresh } = useApiCache('stacks', () => $fetch<any[]>('/api/stacks'))
onMounted(refresh)
const { data: gl } = useFetch('/api/gitlab/status', { lazy: true })

const { connected } = useDockerEvents((evt) => {
  if (['service', 'task'].includes(evt.type)) refresh()
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const search = ref('')
const filtered = computed(() => {
  const q = search.value.toLowerCase()
  return (data.value ?? []).filter((s: any) => !q || s.name?.toLowerCase().includes(q))
})

const open = ref(false)
const form = reactive({ name: '', compose: '', message: '' })
const deploying = ref(false)
const SAMPLE = `version: "3.8"

services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure
    networks:
      - frontend

networks:
  frontend:
    driver: overlay
`
function openDeploy() { form.name = ''; form.compose = SAMPLE; form.message = ''; open.value = true }

async function deploy() {
  if (!form.name || !form.compose) { toast.add({ title: 'Name and compose are required', color: 'warning' }); return }
  deploying.value = true
  try {
    const res: any = await $fetch('/api/stacks', { method: 'POST', body: { name: form.name, compose: form.compose, message: form.message } })
    const parts = [`${res.created?.length || 0} created`, `${res.updated?.length || 0} updated`]
    if (res.removed?.length) parts.push(`${res.removed.length} removed`)
    toast.add({ title: `Deployed ${form.name}`, description: parts.join(', '), color: 'primary', icon: 'i-lucide-rocket' })
    if (res.warnings?.length) toast.add({ title: 'Deployed with warnings', description: res.warnings.slice(0, 3).join('; '), color: 'warning' })
    open.value = false
    refresh()
  } catch (e: any) {
    toast.add({ title: 'Deploy failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { deploying.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="Stacks" subtitle="Compose-defined application stacks, versioned in GitLab" icon="i-lucide-layers">
      <template #actions>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UInput v-model="search" icon="i-lucide-search" placeholder="Filter stacks" class="w-40 sm:w-52" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-rocket" color="primary" label="Deploy stack" @click="openDeploy" />
      </template>
    </PageHeader>

    <div v-if="gl && !gl.enabled" class="notice-warning panel p-3 mb-4 flex items-center gap-2 text-sm">
      <UIcon name="i-lucide-info" class="size-4 shrink-0" />
      GitLab is not configured — stacks deploy fine, but compose files won't be versioned. Set <span class="font-mono text-xs">NUXT_GITLAB_*</span> to enable history.
    </div>

    <DataState :status="status" :error="error" :empty="filtered.length === 0" :refreshing="refreshing" empty-label="No stacks deployed yet." empty-icon="i-lucide-layers">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <NuxtLink v-for="s in filtered" :key="s.name" :to="`/stacks/${s.name}`"
          class="panel p-4 hover:ring-1 hover:ring-beacon/40 transition group">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="flex size-9 items-center justify-center rounded-lg bg-surface-2 ring-1 ring-hull">
                <UIcon name="i-lucide-layers" class="size-4 text-beacon" />
              </span>
              <span class="truncate font-display font-semibold text-foam group-hover:text-beacon">{{ s.name }}</span>
            </div>
            <span v-if="s.inGit" class="inline-flex items-center gap-1 rounded bg-beacon/10 px-1.5 py-0.5 text-[10px] font-medium text-beacon ring-1 ring-beacon/20" title="Tracked in GitLab">
              <UIcon name="i-lucide-git-branch" class="size-3" /> git
            </span>
          </div>
          <div class="mt-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <p class="font-mono text-lg text-foam">{{ s.services }}</p>
              <p class="text-[11px] uppercase tracking-wide text-faint">services</p>
            </div>
            <div>
              <p class="font-mono text-lg" :class="s.runningTasks >= s.desiredTasks && s.desiredTasks > 0 ? 'status-running' : 'status-pending'">
                {{ s.runningTasks ?? 0 }}<span class="text-faint text-sm">/{{ s.desiredTasks ?? 0 }}</span>
              </p>
              <p class="text-[11px] uppercase tracking-wide text-faint">tasks</p>
            </div>
            <div>
              <p class="font-mono text-lg text-foam">{{ s.networks }}</p>
              <p class="text-[11px] uppercase tracking-wide text-faint">networks</p>
            </div>
          </div>
          <div v-if="s.services === 0 && s.inGit" class="mt-3 text-center text-xs text-faint">
            Defined in GitLab, not currently deployed
          </div>
        </NuxtLink>
      </div>
    </DataState>

    <UModal v-model:open="open" title="Deploy stack" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Stack name" required>
            <UInput v-model="form.name" placeholder="my-app" icon="i-lucide-layers" class="w-full font-mono" :disabled="deploying" />
          </UFormField>
          <UFormField label="Compose file" required :hint="gl?.enabled ? 'Committed to GitLab, then deployed' : 'Deployed directly (GitLab off)'">
            <UTextarea v-model="form.compose" :rows="14" class="w-full font-mono text-xs" :ui="{ base: 'font-mono' }" spellcheck="false" :disabled="deploying" />
          </UFormField>
          <UFormField v-if="gl?.enabled" label="Commit message">
            <UInput v-model="form.message" placeholder="Deploy my-app via DockHub" class="w-full" :disabled="deploying" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" :disabled="deploying" @click="open = false" />
          <UButton color="primary" label="Deploy" icon="i-lucide-rocket" :loading="deploying" @click="deploy" />
        </div>
      </template>
    </UModal>
  </div>
</template>
