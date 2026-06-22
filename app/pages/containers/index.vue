<script setup lang="ts">
const { can } = useAuth()
const { prefs } = usePreferences()
const toast = useToast()

const { data, status, error, refreshing, refresh } = useApiCache('containers', () => $fetch<any[]>('/api/containers'))
onMounted(refresh)

const { connected } = useDockerEvents((evt) => {
  if (evt.type === 'container') refresh()
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const containerSortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Image', value: 'image' },
  { label: 'State', value: 'state' },
  { label: 'Status', value: 'status' },
  { label: 'Created', value: 'created' }
]
const containerFilterOptions = [
  { key: 'state', label: 'State', getValue: (c: any) => c.state }
]
const { items: filtered, search, sortBy, sortDir, sortOptions, filters, facets } = useListControls('containers', data, {
  sortOptions: containerSortOptions,
  defaultSortBy: 'name',
  filterOptions: containerFilterOptions
})

const logsOpen = ref(false)
const logsName = ref('')
const logs = ref('')
const logsLoading = ref(false)
async function viewLogs(c: any) {
  logsName.value = c.name; logsOpen.value = true; logsLoading.value = true; logs.value = ''
  try {
    const res: any = await $fetch(`/api/containers/${c.id}/logs`, { query: { tail: 300 } })
    logs.value = res.logs || ''
  } catch (e: any) { logs.value = `Failed: ${e?.data?.statusMessage || e?.message}` }
  finally { logsLoading.value = false }
}

async function remove(c: any) {
  if (!confirm(`Remove container "${c.name}"?`)) return
  const saved = [...(data.value ?? [])]
  data.value = saved.filter((x) => x.id !== c.id)
  try {
    await $fetch(`/api/containers/${c.id}?force=true`, { method: 'DELETE' })
    toast.add({ title: `Removed ${c.name}`, color: 'primary' })
  } catch (e: any) {
    data.value = saved
    toast.add({ title: 'Remove failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

function menu(c: any) {
  const items: any[] = [[{ label: 'Logs', icon: 'i-lucide-scroll-text', onSelect: () => viewLogs(c) }]]
  if (can('operator')) items.push([{ label: 'Remove', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(c) }])
  return items
}
</script>

<template>
  <div>
    <PageHeader title="Containers" subtitle="Raw containers across reachable nodes" icon="i-lucide-container">
      <template #actions>
        <ListControls
          inline
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          v-model:filters="filters"
          :sort-options="sortOptions"
          :facets="facets"
          placeholder="Search containers"
        />
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!filtered.length" :refreshing="refreshing" empty-label="No containers." empty-icon="i-lucide-container">
      <TransitionGroup name="list" tag="div" class="space-y-2">
        <div v-for="c in filtered" :key="c.id" class="panel-flush p-3.5 grid grid-cols-2 gap-3 sm:grid-cols-12 sm:items-center">
          <div class="col-span-2 sm:col-span-4 min-w-0">
            <div class="flex items-center gap-2">
              <span class="dot" :class="c.state === 'running' ? 'dot-running' : c.state === 'exited' || c.state === 'dead' ? 'dot-down' : 'dot-idle'" />
              <span class="truncate font-medium text-foam">{{ c.name || '—' }}</span>
            </div>
            <p class="mt-1 truncate pl-4 font-mono text-xs text-faint">{{ c.image || '—' }}</p>
          </div>
          <div class="sm:col-span-3 font-mono text-xs text-(--color-muted) truncate">{{ c.status || '—' }}</div>
          <div class="sm:col-span-3 min-w-0">
            <div v-if="c.ports?.length" class="flex flex-wrap gap-1">
              <span v-for="(p, i) in c.ports.filter((x: any) => x.PublicPort).slice(0, 2)" :key="i" class="font-mono text-xs text-(--color-muted)">{{ p.PublicPort }}:{{ p.PrivatePort }}</span>
            </div>
            <span v-else class="text-xs text-faint">—</span>
          </div>
          <div class="col-span-2 sm:col-span-2 flex justify-end">
            <UDropdownMenu :items="menu(c)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Actions" />
            </UDropdownMenu>
          </div>
        </div>
      </TransitionGroup>
    </DataState>

    <UModal v-model:open="logsOpen" :title="`Logs · ${logsName}`" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div v-if="logsLoading" class="flex items-center justify-center py-12 text-(--color-muted)">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mr-2" /> Loading…
        </div>
        <pre v-else class="logstream max-h-[55vh] overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">{{ logs || 'No output.' }}</pre>
      </template>
    </UModal>
  </div>
</template>
