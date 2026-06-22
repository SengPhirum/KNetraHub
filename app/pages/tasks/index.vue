<script setup lang="ts">
const { relative, bytes, cpus } = useFormat()
const { prefs } = usePreferences()

const { data, status, error, refreshing, refresh } = useApiCache('tasks', () => $fetch<any[]>('/api/tasks'))
onMounted(refresh)

const { connected } = useDockerEvents((evt) => {
  if (['task', 'service', 'container'].includes(evt.type)) refresh()
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const taskSortOptions = [
  { label: 'Updated', value: 'timestamp' },
  { label: 'Service', value: 'service' },
  { label: 'Node', value: 'node' },
  { label: 'CPU', value: 'metrics.cpuPercent' },
  { label: 'Memory', value: 'metrics.memoryUsedBytes' },
  { label: 'Slot', value: 'slot' }
]
const taskFilterOptions = [
  { key: 'state', label: 'Status', getValue: (t: any) => t.state },
  { key: 'node', label: 'Node', getValue: (t: any) => t.node },
  { key: 'service', label: 'Service', getValue: (t: any) => t.service }
]
const { items: filtered, search, sortBy, sortDir, sortOptions, filters, facets } = useListControls('tasks', data, {
  sortOptions: taskSortOptions,
  defaultSortBy: 'timestamp',
  defaultSortDir: 'desc',
  filterOptions: taskFilterOptions,
  tieBreaker: (t: any) => t.createdAt
})

function memoryPercent(used?: number | null, limit?: number | null) {
  if (!used || !limit) return null
  return Math.min(100, (used / limit) * 100)
}

function percentLabel(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '-'
  return `${value.toFixed(value < 10 ? 1 : 0)}%`
}

function taskCpuPercent(t: any) {
  return t.metrics ? percentLabel(t.metrics.cpuPercent) : '-'
}

function taskCpuDetail(t: any) {
  return t.metrics ? cpus(Number(t.metrics.cpuPercent || 0) / 100) : ''
}

function taskMemoryPercent(t: any) {
  if (!t.metrics) return '-'
  const pct = memoryPercent(t.metrics.memoryUsedBytes, t.metrics.memoryLimitBytes)
  return pct == null ? '-' : percentLabel(pct)
}

function taskMemoryDetail(t: any) {
  return t.metrics ? bytes(t.metrics.memoryUsedBytes) : ''
}

function openTask(t: any) {
  navigateTo(`/tasks/${t.id}`)
}
</script>

<template>
  <div>
    <PageHeader title="Tasks" subtitle="Individual task instances scheduled across the swarm" icon="i-lucide-list-checks">
      <template #actions>
        <ListControls
          inline
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          v-model:filters="filters"
          :sort-options="sortOptions"
          :facets="facets"
          placeholder="Search tasks"
        />
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
      </template>
    </PageHeader>

    <div class="mb-3 flex items-center justify-between gap-3">
      <p class="text-sm text-(--color-muted)">Total (<span class="font-semibold text-foam">{{ filtered.length }}</span>)</p>
    </div>

    <DataState :status="status" :error="error" :empty="!filtered.length" :refreshing="refreshing" empty-label="No tasks." empty-icon="i-lucide-list-checks">
      <section class="panel p-0 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="border-y border-hull text-xs uppercase tracking-wide text-faint">
              <tr>
                <th class="px-4 py-3 font-medium">Task</th>
                <th class="px-4 py-3 font-medium">Node</th>
                <th class="px-4 py-3 font-medium">CPU usage</th>
                <th class="px-4 py-3 font-medium">Memory usage</th>
                <th class="px-4 py-3 font-medium">Last update</th>
                <th class="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-hull">
              <tr v-if="!filtered.length">
                <td colspan="6" class="px-4 py-8 text-center text-(--color-muted)">No tasks.</td>
              </tr>
              <tr
                v-for="t in filtered"
                :key="t.id"
                class="cursor-pointer align-top transition hover:bg-surface-2/60"
                tabindex="0"
                role="link"
                :aria-label="`Open task ${t.service}`"
                @click="openTask(t)"
                @keydown.enter="openTask(t)"
              >
                <td class="px-4 py-3">
                  <p class="truncate font-medium text-foam">
                    {{ t.service || '—' }}<span v-if="t.slot != null" class="text-faint">.{{ t.slot }}</span>
                  </p>
                  <p class="mt-0.5 truncate font-mono text-xs text-faint">{{ t.image || '—' }}</p>
                </td>
                <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ t.node || '—' }}</td>
                <td class="px-4 py-3">
                  <p class="font-mono text-sm text-foam">{{ taskCpuPercent(t) }}</p>
                  <p class="mt-0.5 font-mono text-xs text-faint">{{ taskCpuDetail(t) }}</p>
                </td>
                <td class="px-4 py-3">
                  <p class="font-mono text-sm text-foam">{{ taskMemoryPercent(t) }}</p>
                  <p class="mt-0.5 font-mono text-xs text-faint">{{ taskMemoryDetail(t) }}</p>
                </td>
                <td class="px-4 py-3 text-xs text-faint">{{ relative(t.timestamp) }}</td>
                <td class="px-4 py-3"><StatusBadge :state="t.state" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </DataState>
  </div>
</template>
