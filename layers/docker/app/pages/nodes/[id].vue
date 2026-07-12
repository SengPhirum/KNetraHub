<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string
const { can } = useAuth()
const { bytes, cpus, relative, short } = useFormat()
const toast = useToast()

const { data, status, error, refresh } = await useFetch(`/api/nodes/${id}`, { lazy: true })
const { data: usageData, refresh: refreshUsage } = await useFetch<any>('/api/nodes/usage', { lazy: true })

const node = computed(() => data.value?.node)
const usage = computed(() => (usageData.value?.nodes || []).find((u: any) => u.id === id))

// resource history (kept as-is)
const range = ref<'1h' | '6h' | '24h' | '7d'>('1h')
const { data: metricsData, refresh: refreshMetrics } = await useFetch(`/api/nodes/${id}/metrics`, {
  query: { range }, lazy: true
})
watch(range, () => refreshMetrics())

function timeLabel(iso: string) {
  const d = new Date(iso)
  return range.value === '7d' || range.value === '24h'
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const cpuSeries = computed(() => metricsData.value?.series?.cpu || [])
const memorySeries = computed(() => metricsData.value?.series?.memory || [])
const diskSeries = computed(() => metricsData.value?.series?.disk || [])
const networkSeries = computed(() => metricsData.value?.series?.network || [])
const historyLabels = computed(() => cpuSeries.value.map((p: any) => timeLabel(p.time)))

const desc = computed(() => node.value?.Description)
const hostname = computed(() => desc.value?.Hostname)
const labels = computed<Record<string, string>>(() => node.value?.Spec?.Labels || {})
const taskRows = computed(() => data.value?.tasksDetailed || [])
const runningCount = computed(() => taskRows.value.filter((t: any) => t.state === 'running').length)
const taskSortOptions = [
  { label: 'Service', value: 'service' },
  { label: 'State', value: 'state' },
  { label: 'CPU', value: 'metrics.cpuPercent' },
  { label: 'Memory', value: 'metrics.memoryUsedBytes' },
  { label: 'Updated', value: 'timestamp' }
]
const taskFilterOptions = [
  { key: 'state', label: 'Status', getValue: (t: any) => t.state }
]
const { items: filteredTasks, search, sortBy, sortDir, sortOptions, filters: taskFilters, facets: taskFacets } = useListControls(`node:${id}:tasks`, taskRows, {
  sortOptions: taskSortOptions,
  defaultSortBy: 'timestamp',
  defaultSortDir: 'desc',
  filterOptions: taskFilterOptions,
  defaultFilters: { state: ['running'] }
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

// badges (mirrors app/pages/nodes/index.vue)
function badgeClass(kind: string) {
  const state = (kind || '').toLowerCase()
  if (['ready', 'active', 'reachable'].includes(state)) return 'bg-running/15 text-(--color-running-ink) ring-running/25'
  if (['leader'].includes(state)) return 'bg-pending/20 text-(--color-pending-ink) ring-pending/30'
  if (['manager'].includes(state)) return 'bg-beacon/15 text-beacon ring-beacon/25'
  if (['worker'].includes(state)) return 'bg-idle/15 text-(--color-idle-ink) ring-idle/25'
  if (['pause', 'paused', 'drain', 'drained'].includes(state)) return 'bg-idle/15 text-(--color-idle-ink) ring-idle/25'
  if (['down', 'failed'].includes(state)) return 'bg-down/15 text-(--color-down-ink) ring-down/25'
  return 'bg-surface-2 text-(--color-muted) ring-hull'
}
const nodeBadges = computed(() => {
  const n = node.value
  if (!n) return []
  const badges = [
    n.Status?.State || 'unknown',
    ...(n.ManagerStatus?.Leader ? ['leader'] : []),
    n.Spec?.Role || 'unknown',
    n.Spec?.Availability || 'unknown'
  ]
  return badges.map((label) => ({ label: String(label).toUpperCase(), class: badgeClass(String(label)) }))
})

const { usageRingStyle } = useUsageRing()
function ringDetail(label: string, percent?: number | null, hint?: string) {
  if (!usage.value?.available) return `${label}: waiting for node metrics.`
  return `${label}: ${percentLabel(percent)}${hint ? ` (${hint})` : ''}`
}

// plugins (per-node Engine.Plugins, grouped by type)
const pluginGroups = computed(() => {
  const plugins = (desc.value?.Engine?.Plugins || []) as Array<{ Type: string; Name: string }>
  const groups = new Map<string, string[]>()
  for (const p of plugins) {
    if (!groups.has(p.Type)) groups.set(p.Type, [])
    groups.get(p.Type)!.push(p.Name)
  }
  return Array.from(groups.entries()).map(([type, names]) => ({ type, names }))
})

function labelEntries(labelsValue: Record<string, string>) {
  return Object.entries(labelsValue || {}) as Array<[string, string]>
}

// availability/role actions (mirrors app/pages/nodes/index.vue's per-card menu)
async function patch(body: any, label: string) {
  try {
    await $fetch(`/api/nodes/${id}`, { method: 'PATCH', body })
    toast.add({ title: `${hostname.value}: ${label}`, color: 'primary', icon: 'i-lucide-server' })
    refresh()
  } catch (e: any) {
    toast.add({ title: 'Action failed', description: e?.data?.statusMessage, color: 'error' })
  }
}
const editMenu = computed(() => {
  const n = node.value
  if (!n) return []
  const avail: any[] = []
  if (n.Spec?.Availability !== 'active') avail.push({ label: 'Activate', icon: 'i-lucide-play', onSelect: () => patch({ availability: 'active' }, 'activated') })
  if (n.Spec?.Availability !== 'pause') avail.push({ label: 'Pause', icon: 'i-lucide-pause', onSelect: () => patch({ availability: 'pause' }, 'paused') })
  if (n.Spec?.Availability !== 'drain') avail.push({ label: 'Drain', icon: 'i-lucide-download', onSelect: () => patch({ availability: 'drain' }, 'draining') })
  const role = n.Spec?.Role === 'worker'
    ? { label: 'Promote to manager', icon: 'i-lucide-arrow-up', onSelect: () => patch({ role: 'manager' }, 'promoted') }
    : { label: 'Demote to worker', icon: 'i-lucide-arrow-down', onSelect: () => patch({ role: 'worker' }, 'demoted') }
  return [avail, [role], [{ label: 'Edit labels', icon: 'i-lucide-tags', onSelect: openLabels }]]
})

// label editor
const labelsOpen = ref(false)
const labelRows = ref<{ k: string; v: string }[]>([])
function openLabels() {
  labelRows.value = Object.entries(labels.value).map(([k, v]) => ({ k, v: String(v) }))
  if (!labelRows.value.length) labelRows.value.push({ k: '', v: '' })
  labelsOpen.value = true
}
async function saveLabels() {
  const obj: Record<string, string> = {}
  for (const r of labelRows.value) if (r.k.trim()) obj[r.k.trim()] = r.v
  try {
    await $fetch(`/api/nodes/${id}`, { method: 'PATCH', body: { labels: obj } })
    toast.add({ title: 'Labels updated', color: 'primary', icon: 'i-lucide-tags' })
    labelsOpen.value = false
    setTimeout(refresh, 600)
  } catch (e: any) { toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' }) }
}

async function remove() {
  if (!confirm(`Remove node "${hostname.value}" from the swarm? It must be down or drained first.`)) return
  try {
    await $fetch(`/api/nodes/${id}?force=true`, { method: 'DELETE' })
    toast.add({ title: `Removed ${hostname.value}`, color: 'primary' })
    navigateTo('/nodes')
  } catch (e: any) { toast.add({ title: 'Remove failed', description: e?.data?.statusMessage, color: 'error' }) }
}

async function refreshAll() {
  await Promise.all([refresh(), refreshUsage()])
}
</script>

<template>
  <div>
    <DataState :status="status" :error="error">
      <PageHeader :title="hostname || short(id)" :subtitle="node?.Spec?.Role" icon="i-lucide-server">
        <template #actions>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/nodes" label="Back" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refreshAll()" />
          <template v-if="can('operator')">
            <UDropdownMenu :items="editMenu" :content="{ align: 'end' }">
              <UButton icon="i-lucide-pencil" color="primary" label="Edit" trailing-icon="i-lucide-chevron-down" />
            </UDropdownMenu>
          </template>
          <UButton v-if="can('admin')" icon="i-lucide-trash-2" color="error" variant="soft" label="Delete" @click="remove" />
        </template>
      </PageHeader>

      <div class="grid gap-4 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.6fr)]">
        <div class="space-y-4">
          <section class="panel p-4">
            <div class="flex flex-wrap gap-1.5">
              <span v-for="badge in nodeBadges" :key="badge.label" class="rounded px-2 py-1 text-[11px] font-semibold leading-none ring-1" :class="badge.class">
                {{ badge.label }}
              </span>
            </div>

            <div class="mt-6 grid grid-cols-3 gap-3 text-center">
              <div>
                <div class="summary-ring-wrap" :title="ringDetail('CPU', usage?.cpu?.percent, usage?.available ? `${Number(usage.cpu.cores || 0).toFixed(1)} used / ${cpus(desc?.Resources?.NanoCPUs ? desc.Resources.NanoCPUs / 1e9 : 0)}` : '')">
                  <div class="summary-ring mx-auto size-20 sm:size-24" :style="usageRingStyle(usage?.available ? usage.cpu.percent : 0)" tabindex="0">
                    <div class="summary-ring-inner">
                      <p class="font-mono text-sm font-semibold text-foam">{{ cpus((desc?.Resources?.NanoCPUs || 0) / 1e9) }}</p>
                      <p class="text-[10px] leading-tight text-faint">vCPU</p>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div class="summary-ring-wrap" :title="ringDetail('Disk', usage?.disk?.percent, usage?.available && usage.disk.totalBytes ? `${bytes(usage.disk.usedBytes)} / ${bytes(usage.disk.totalBytes)}` : '')">
                  <div class="summary-ring mx-auto size-20 sm:size-24" :style="usageRingStyle(usage?.available ? usage.disk.percent : 0)" tabindex="0">
                    <div class="summary-ring-inner">
                      <p class="font-mono text-xs font-semibold text-foam">{{ usage?.available && usage.disk.totalBytes ? bytes(usage.disk.totalBytes) : '—' }}</p>
                      <p class="text-[10px] leading-tight text-faint">disk</p>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div class="summary-ring-wrap" :title="ringDetail('RAM', usage?.memory?.percent, usage?.available ? `${bytes(usage.memory.usedBytes)} / ${bytes(usage.memory.totalBytes)}` : '')">
                  <div class="summary-ring mx-auto size-20 sm:size-24" :style="usageRingStyle(usage?.available ? usage.memory.percent : 0)" tabindex="0">
                    <div class="summary-ring-inner">
                      <p class="font-mono text-xs font-semibold text-foam">{{ bytes(desc?.Resources?.MemoryBytes) }}</p>
                      <p class="text-[10px] leading-tight text-faint">ram</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <dl class="mt-6 divide-y divide-hull text-sm">
              <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">ID</dt><dd class="truncate font-mono text-(--color-muted)" :title="id">{{ short(id, 20) }}</dd></div>
              <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Name</dt><dd class="text-foam">{{ hostname || '-' }}</dd></div>
              <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Address</dt><dd class="font-mono text-(--color-muted)">{{ node?.Status?.Addr || '-' }}</dd></div>
              <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Engine</dt><dd class="font-mono text-(--color-muted)">{{ desc?.Engine?.EngineVersion || '-' }}</dd></div>
              <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">OS</dt><dd class="font-mono text-(--color-muted)">{{ desc?.Platform?.OS || '-' }}</dd></div>
              <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Arch</dt><dd class="font-mono text-(--color-muted)">{{ desc?.Platform?.Architecture || '-' }}</dd></div>
              <div v-if="node?.ManagerStatus" class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Reachability</dt><dd class="font-mono text-(--color-muted)">{{ node.ManagerStatus.Reachability }}</dd></div>
            </dl>
          </section>

          <section v-if="pluginGroups.length" class="panel p-4">
            <h3 class="font-display text-sm font-semibold text-foam mb-3">Plugins</h3>
            <div class="space-y-3">
              <div v-for="group in pluginGroups" :key="group.type">
                <p class="mb-1.5 text-xs font-semibold uppercase text-faint">{{ group.type }}</p>
                <div class="flex flex-wrap gap-2">
                  <span v-for="name in group.names" :key="name" class="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-(--color-muted) ring-1 ring-hull-soft">{{ name }}</span>
                </div>
              </div>
            </div>
          </section>

          <section class="panel p-4">
            <h3 class="font-display text-sm font-semibold text-foam mb-3">Labels</h3>
            <div v-if="!labelEntries(labels).length" class="text-sm text-faint">No labels set.</div>
            <dl v-else class="divide-y divide-hull text-sm">
              <div v-for="[k, v] in labelEntries(labels)" :key="k" class="py-2">
                <dt class="font-medium text-foam">{{ k }}</dt>
                <dd class="mt-0.5 font-mono text-xs text-(--color-muted)">{{ v }}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div class="space-y-4 min-w-0">
          <section class="panel p-0 overflow-hidden">
            <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <h2 class="font-display text-lg font-semibold text-foam">Tasks</h2>
                <p class="text-xs text-faint">Running: {{ runningCount }}</p>
              </div>
              <span class="text-xs text-faint">{{ filteredTasks.length }} shown</span>
            </div>
            <div class="px-4 pb-3">
              <ListControls
                v-model:search="search"
                v-model:sort-by="sortBy"
                v-model:sort-dir="sortDir"
                v-model:filters="taskFilters"
                :sort-options="sortOptions"
                :facets="taskFacets"
                placeholder="Search node tasks"
              />
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead class="border-y border-hull text-xs uppercase tracking-wide text-faint">
                  <tr>
                    <th class="px-4 py-3 font-medium">Task</th>
                    <th class="px-4 py-3 font-medium">CPU usage</th>
                    <th class="px-4 py-3 font-medium">Memory usage</th>
                    <th class="px-4 py-3 font-medium">Last update</th>
                    <th class="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-hull">
                  <tr v-if="!filteredTasks.length">
                    <td colspan="5" class="px-4 py-8 text-center text-(--color-muted)">No tasks scheduled here.</td>
                  </tr>
                  <tr
                    v-for="t in filteredTasks"
                    :key="t.id"
                    class="cursor-pointer align-top transition hover:bg-surface-2/60"
                    tabindex="0"
                    @click="navigateTo(`/tasks/${t.id}`)"
                    @keydown.enter="navigateTo(`/tasks/${t.id}`)"
                  >
                    <td class="px-4 py-3">
                      <p class="font-medium text-foam">{{ t.service || '—' }}<span v-if="t.slot != null" class="text-faint">.{{ t.slot }}</span></p>
                      <p class="mt-0.5 truncate font-mono text-xs text-faint">{{ t.image || '-' }}</p>
                    </td>
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

          <section class="panel p-4">
            <div class="flex items-center justify-between gap-3 mb-3">
              <h3 class="font-display text-sm font-semibold text-foam">Resource history</h3>
              <USelect v-model="range" :items="['1h', '6h', '24h', '7d']" size="xs" class="w-24" />
            </div>
            <ClientOnly>
              <div class="grid gap-4 lg:grid-cols-2">
                <div>
                  <p class="text-xs text-faint mb-1">CPU %</p>
                  <MetricsChart
                    :labels="historyLabels"
                    :datasets="[{ label: 'CPU', data: cpuSeries.map((p: any) => p.percent) }]"
                    :format-value="(n) => `${n.toFixed(1)}%`"
                  />
                </div>
                <div>
                  <p class="text-xs text-faint mb-1">Memory</p>
                  <MetricsChart
                    :labels="historyLabels"
                    :datasets="[{ label: 'Used', data: memorySeries.map((p: any) => p.used) }]"
                    :format-value="bytes"
                  />
                </div>
                <div>
                  <p class="text-xs text-faint mb-1">Disk %</p>
                  <MetricsChart
                    :labels="historyLabels"
                    :datasets="[{ label: 'Disk', data: diskSeries.map((p: any) => p.percent) }]"
                    :format-value="(n) => `${n.toFixed(1)}%`"
                  />
                </div>
                <div>
                  <p class="text-xs text-faint mb-1">Network</p>
                  <MetricsChart
                    :labels="historyLabels"
                    :datasets="[
                      { label: 'Rx/s', data: networkSeries.map((p: any) => p.rxBytesPerSec) },
                      { label: 'Tx/s', data: networkSeries.map((p: any) => p.txBytesPerSec) }
                    ]"
                    :format-value="bytes"
                  />
                </div>
              </div>
            </ClientOnly>
          </section>
        </div>
      </div>
    </DataState>

    <!-- labels modal -->
    <UModal v-model:open="labelsOpen" title="Edit node labels">
      <template #body>
        <div class="space-y-2">
          <div v-for="(r, i) in labelRows" :key="i" class="flex gap-2">
            <UInput v-model="r.k" placeholder="key" class="flex-1 font-mono" />
            <UInput v-model="r.v" placeholder="value" class="flex-1 font-mono" />
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" @click="labelRows.splice(i, 1)" />
          </div>
          <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-plus" label="Add label" @click="labelRows.push({ k: '', v: '' })" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="labelsOpen = false" />
          <UButton color="primary" label="Save" icon="i-lucide-check" @click="saveLabels" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.summary-ring-wrap {
  position: relative;
}

.summary-ring {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  padding: 0.5rem;
  /* transition lives in main.css - a scoped one would override the animated ring sweep */
}

.summary-ring:focus-visible,
.summary-ring:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.summary-ring-inner {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  background: var(--color-surface);
  padding: 0.25rem;
}
</style>
