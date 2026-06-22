<script setup lang="ts">
const { can } = useAuth()
const { prefs } = usePreferences()
const { relative } = useFormat()
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

const stackSortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Services', value: 'services' },
  { label: 'Running tasks', value: 'runningTasks' },
  { label: 'Desired tasks', value: 'desiredTasks' },
  { label: 'Networks', value: 'networks' },
  { label: 'Volumes', value: 'volumes' },
  { label: 'Configs', value: 'configs' },
  { label: 'Secrets', value: 'secrets' },
  { label: 'Updated', value: 'updatedAt' },
  { label: 'Git tracked', value: 'inGit' }
]
const stackFilterOptions = [
  { key: 'inGit', label: 'Git tracked', getValue: (s: any) => s.inGit ? 'Yes' : 'No' }
]
const { items: filtered, search, sortBy, sortDir, sortOptions, filters, facets } = useListControls('stacks', data, {
  sortOptions: stackSortOptions,
  defaultSortBy: 'name',
  filterOptions: stackFilterOptions
})

function stackStatus(s: any) {
  if (!s.services) return 'defined'
  return s.runningTasks >= s.desiredTasks && s.desiredTasks > 0 ? 'deployed' : 'partial'
}

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
        <ListControls
          inline
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          v-model:filters="filters"
          :sort-options="sortOptions"
          :facets="facets"
          placeholder="Search stacks"
        />
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-rocket" color="primary" label="Deploy stack" @click="openDeploy" />
      </template>
    </PageHeader>

    <div v-if="gl && !gl.enabled" class="notice-warning panel p-3 mb-4 flex items-center gap-2 text-sm">
      <UIcon name="i-lucide-info" class="size-4 shrink-0" />
      GitLab is not configured — stacks deploy fine, but compose files won't be versioned. Set <span class="font-mono text-xs">NUXT_GITLAB_*</span> to enable history.
    </div>

    <DataState :status="status" :error="error" :empty="filtered.length === 0" :refreshing="refreshing" empty-label="No stacks deployed yet." empty-icon="i-lucide-layers">
      <section class="panel p-0 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="border-y border-hull text-xs uppercase tracking-wide text-faint">
              <tr>
                <th class="px-4 py-3 font-medium">Name</th>
                <th class="px-4 py-3 font-medium">Services</th>
                <th class="px-4 py-3 font-medium">Networks</th>
                <th class="px-4 py-3 font-medium">Volumes</th>
                <th class="px-4 py-3 font-medium">Configs</th>
                <th class="px-4 py-3 font-medium">Secrets</th>
                <th class="px-4 py-3 font-medium">Updated</th>
                <th class="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-hull">
              <tr v-if="!filtered.length">
                <td colspan="8" class="px-4 py-8 text-center text-(--color-muted)">No stacks deployed yet.</td>
              </tr>
              <tr
                v-for="s in filtered"
                :key="s.name"
                class="cursor-pointer align-top transition hover:bg-surface-2/60"
                tabindex="0"
                role="link"
                :aria-label="`Open stack ${s.name}`"
                @click="navigateTo(`/stacks/${s.name}`)"
                @keydown.enter="navigateTo(`/stacks/${s.name}`)"
              >
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-layers" class="size-4 shrink-0 text-beacon" />
                    <span class="truncate font-medium text-foam">{{ s.name }}</span>
                    <span v-if="s.inGit" class="inline-flex shrink-0 items-center gap-1 rounded bg-beacon/10 px-1.5 py-0.5 text-[10px] font-medium text-beacon ring-1 ring-beacon/20" title="Tracked in GitLab">
                      <UIcon name="i-lucide-git-branch" class="size-3" /> git
                    </span>
                  </div>
                  <p v-if="s.services" class="mt-0.5 truncate font-mono text-xs text-faint">{{ s.runningTasks ?? 0 }}/{{ s.desiredTasks ?? 0 }} tasks running</p>
                  <p v-else-if="s.inGit" class="mt-0.5 truncate text-xs text-faint">Defined in GitLab, not currently deployed</p>
                </td>
                <td class="px-4 py-3 font-mono text-(--color-muted)">{{ s.services }}</td>
                <td class="px-4 py-3 font-mono text-(--color-muted)">{{ s.networks }}</td>
                <td class="px-4 py-3 font-mono text-(--color-muted)">{{ s.volumes ?? 0 }}</td>
                <td class="px-4 py-3 font-mono text-(--color-muted)">{{ s.configs }}</td>
                <td class="px-4 py-3 font-mono text-(--color-muted)">{{ s.secrets }}</td>
                <td class="px-4 py-3 text-xs text-faint">{{ s.updatedAt ? relative(s.updatedAt) : '—' }}</td>
                <td class="px-4 py-3"><StatusBadge :state="stackStatus(s)" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
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
