<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string
const { can } = useAuth()
const { prefs } = usePreferences()
const { relative, short, bytes, cpus } = useFormat()
const toast = useToast()

const { data, status, error, refreshing, refresh } = useApiCache(`service:${id}`, () => $fetch<any>(`/api/services/${id}`))
onMounted(refresh)

const summary = computed(() => data.value?.summary || {})
const name = computed(() => summary.value.name || short(id))
const image = computed(() => summary.value.image || '')
const mode = computed(() => summary.value.mode || 'replicated')
const replicas = computed(() => summary.value.replicas ?? null)
const stack = computed(() => summary.value.stack)
const ports = computed(() => data.value?.ports || [])
const envs = computed(() => data.value?.environment || [])
const networks = computed(() => data.value?.networks || [])
const mounts = computed(() => data.value?.mounts || [])
const extraHosts = computed(() => data.value?.extraHosts || [])
const serviceLabels = computed(() => data.value?.labels?.service || {})
const containerLabels = computed(() => data.value?.labels?.container || {})
const configs = computed(() => data.value?.configs || [])
const secrets = computed(() => data.value?.secrets || [])
const resources = computed(() => summary.value.resources || {})
const currentUsage = computed(() => summary.value.currentUsage || { available: false })

// After the first load above, updates to THIS service arrive as
// server-pushed data (see server/utils/resourcePush.ts) - applied directly
// to state, no re-$fetch. The metrics chart's range is user-selectable
// per-tab, which doesn't fit a single shared broadcast, so it stays on the
// interval-fallback path (still gated on the push connection being down).
const { connected } = useDockerEvents((evt) => {
  if (evt.type === 'resource-detail' && evt.resource === 'service' && evt.id === id) data.value = evt.data
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) {
    refresh()
    refreshMetrics()
  }
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const range = ref<'1h' | '6h' | '24h' | '7d'>('1h')
const { data: metricsData, error: metricsError, refresh: refreshMetrics } = await useFetch<any>(`/api/services/${id}/metrics`, {
  query: { range },
  lazy: true
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
const networkSeries = computed(() => metricsData.value?.series?.network || [])
const chartSource = computed(() => cpuSeries.value.length ? cpuSeries.value : memorySeries.value.length ? memorySeries.value : networkSeries.value)
const historyLabels = computed(() => chartSource.value.map((p: any) => timeLabel(p.time)))
const hasMetrics = computed(() => cpuSeries.value.length || memorySeries.value.length || networkSeries.value.length)

const tab = ref<'overview' | 'logs' | 'history'>('overview')

const taskRows = computed(() => data.value?.tasksDetailed || [])
const taskSortOptions = [
  { label: 'Slot', value: 'slot' },
  { label: 'State', value: 'state' },
  { label: 'Node', value: 'nodeName' },
  { label: 'CPU', value: 'metrics.cpuPercent' },
  { label: 'Memory', value: 'metrics.memoryUsedBytes' },
  { label: 'Updated', value: 'timestamp' }
]
const taskFilterOptions = [
  { key: 'state', label: 'Status', getValue: (t: any) => t.state }
]
const { items: filteredTasks, search, sortBy, sortDir, sortOptions, filters: taskFilters, facets: taskFacets } = useListControls(`service:${id}:tasks`, taskRows, {
  sortOptions: taskSortOptions,
  defaultSortBy: 'slot',
  filterOptions: taskFilterOptions,
  // Failed tasks are exactly what you come to this table to find, so the
  // default filter shows them alongside running ones. Users can still change
  // or clear the filter entirely (the choice persists per user).
  defaultFilters: { state: ['running', 'failed'] }
})

const statusEvents = ref<any[]>([])
const historyLoading = ref(false)
async function loadHistory() {
  historyLoading.value = true
  try {
    const res: any = await $fetch(`/api/services/${id}/status-events`)
    statusEvents.value = res.events || []
  } finally {
    historyLoading.value = false
  }
}
watch(tab, (t) => { if (t === 'history' && !statusEvents.value.length) loadHistory() })

const logs = ref('')
const logsLoading = ref(false)
const tail = ref(200)
async function loadLogs() {
  logsLoading.value = true
  try {
    const res: any = await $fetch(`/api/services/${id}/logs`, { query: { tail: tail.value } })
    logs.value = res.logs || ''
  } catch (e: any) {
    logs.value = `Failed to load logs: ${e?.data?.statusMessage || e?.message}`
  } finally {
    logsLoading.value = false
  }
}
watch(tab, (t) => { if (t === 'logs' && !logs.value) loadLogs() })

// Single Swarmpit-style tabbed "Edit service" wizard (General / Network /
// Environment / Resources / Deployment / Logs) - every pencil icon and the
// header's main Edit button all open the same modal, just defaulting to the
// tab relevant to whichever card was clicked.
const editModalOpen = ref(false)
const editModalTab = ref('general')
function openEditModal(tab: string) {
  editModalTab.value = tab
  editModalOpen.value = true
}
function onServiceSaved() {
  setTimeout(refresh, 700)
}

async function redeploy() {
  try {
    await $fetch(`/api/services/${id}/redeploy`, { method: 'POST' })
    toast.add({ title: 'Redeploying', color: 'primary', icon: 'i-lucide-refresh-cw' })
    setTimeout(refresh, 700)
  } catch (e: any) {
    toast.add({ title: 'Redeploy failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function remove() {
  if (!confirm(`Delete service "${name.value}"?`)) return
  try {
    await $fetch(`/api/services/${id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${name.value}`, color: 'primary' })
    navigateTo('/services')
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

function viewLogs() {
  tab.value = 'logs'
  if (!logs.value) loadLogs()
}

function formatNanoCpus(value?: number | null) {
  return value ? cpus(value / 1e9) : '-'
}

function formatBytes(value?: number | null) {
  return value ? bytes(value) : '-'
}

function replicaLabel() {
  return mode.value === 'global'
    ? `${summary.value.running ?? 0}/global`
    : `${summary.value.running ?? 0}/${replicas.value ?? 0}`
}

function portsLabel(portsValue: any[] = ports.value) {
  if (!portsValue.length) return '-'
  return portsValue.map((p) => {
    const proto = p.protocol && p.protocol !== 'tcp' ? `/${p.protocol}` : ''
    return p.published ? `${p.published}:${p.target}${proto}` : `${p.target}${proto}`
  }).join(', ')
}

// Prefer the hard limit as the usage ring's ceiling - reservation is only a
// scheduling guarantee (what Swarm sets aside), not a cap the container is
// held to, so comparing live usage against it made containers show as "at
// capacity" the moment they used more than their reservation while still
// well under their actual limit.
function resourceCpuNano() {
  return resources.value.limitNanoCpusTotal || resources.value.reservedNanoCpusTotal || 0
}

function resourceMemoryBytes() {
  return resources.value.limitMemoryBytesTotal || resources.value.reservedMemoryBytesTotal || 0
}

// Comparison ceiling for the ring fill: the service's own reservation/limit
// when configured, otherwise the combined capacity of the node(s) currently
// running it - so a service with no resource config still gets a meaningful
// percentage instead of an empty/misleading ring.
function cpuCeilingNano() {
  return resourceCpuNano() || currentUsage.value.nodeCpuNanos || 0
}

function memoryCeilingBytes() {
  return resourceMemoryBytes() || currentUsage.value.nodeMemoryBytes || 0
}

function resourceBasis() {
  if (resources.value.limitNanoCpusTotal || resources.value.limitMemoryBytesTotal) return 'limit'
  if (resources.value.reservedNanoCpusTotal || resources.value.reservedMemoryBytesTotal) return 'reserved'
  if (currentUsage.value.nodeCpuNanos || currentUsage.value.nodeMemoryBytes) return 'node capacity'
  return 'not set'
}

function memoryPercent(used?: number | null, limit?: number | null) {
  if (!used || !limit) return null
  return Math.min(100, (used / limit) * 100)
}

function percentLabel(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '-'
  return `${value.toFixed(value < 10 ? 1 : 0)}%`
}

function usageMemoryPercent() {
  return memoryPercent(currentUsage.value.memoryUsedBytes, memoryCeilingBytes() || currentUsage.value.memoryLimitBytes)
}

const { usageRingStyle, fulfillmentRingStyle } = useUsageRing()

function replicaPercent() {
  const desired = Number(summary.value.desired || replicas.value || 0)
  const running = Number(summary.value.running || 0)
  if (desired <= 0) return running > 0 ? 100 : 0
  return (running / desired) * 100
}

function replicaDetail() {
  const desired = mode.value === 'global' ? 'global' : `${summary.value.desired ?? replicas.value ?? 0} desired`
  return `${summary.value.running ?? 0} running / ${desired}`
}

function cpuRingPercent() {
  if (!currentUsage.value.available) return 0
  const ceiling = cpuCeilingNano() / 1e9
  if (ceiling > 0) return (Number(currentUsage.value.cpuPercent || 0) / (ceiling * 100)) * 100
  return Number(currentUsage.value.cpuPercent || 0)
}

// Ring center label: the configured allocation when there is one, otherwise
// live usage (more useful than a static "-") - distinct from the ring fill's
// ceiling, which prefers node capacity once no allocation is configured.
function cpuHeadline() {
  if (resourceCpuNano()) return formatNanoCpus(resourceCpuNano())
  if (currentUsage.value.available) return cpus(Number(currentUsage.value.cpuPercent || 0) / 100)
  return '-'
}

function cpuDetail() {
  const ceilingNano = cpuCeilingNano()
  const allocated = ceilingNano ? `${formatNanoCpus(ceilingNano)} ${resourceBasis()}` : 'No CPU reservation or limit'
  if (!currentUsage.value.available) return `${allocated}. Waiting for current usage samples.`
  return `${percentLabel(currentUsage.value.cpuPercent)} CPU now (${cpus(Number(currentUsage.value.cpuPercent || 0) / 100)}), ${allocated}.`
}

function memoryRingPercent() {
  if (!currentUsage.value.available) return 0
  return usageMemoryPercent() ?? 0
}

function memoryHeadline() {
  if (resourceMemoryBytes()) return formatBytes(resourceMemoryBytes())
  if (currentUsage.value.available) return formatBytes(currentUsage.value.memoryUsedBytes)
  return '-'
}

function memoryDetail() {
  const ceilingBytes = memoryCeilingBytes()
  const allocated = ceilingBytes ? `${formatBytes(ceilingBytes)} ${resourceBasis()}` : 'No memory reservation or limit'
  if (!currentUsage.value.available) return `${allocated}. Waiting for current usage samples.`
  return `${formatBytes(currentUsage.value.memoryUsedBytes)} used / ${formatBytes(ceilingBytes || currentUsage.value.memoryLimitBytes)} (${percentLabel(memoryRingPercent())}), ${allocated}.`
}

function taskMemoryLabel(task: any) {
  const metric = task.metrics
  if (!metric) return '-'
  const pct = memoryPercent(metric.memoryUsedBytes, metric.memoryLimitBytes)
  return pct == null ? bytes(metric.memoryUsedBytes) : `${percentLabel(pct)} / ${bytes(metric.memoryUsedBytes)}`
}

function taskCpuLabel(task: any) {
  return task.metrics ? percentLabel(task.metrics.cpuPercent) : '-'
}

function labelEntries(labels: Record<string, string>) {
  return Object.entries(labels || {}) as Array<[string, string]>
}

function listLabel(items: string[] = []) {
  return items.length ? items.join(', ') : '-'
}

const DURATION_KEYS = new Set(['Delay', 'Window', 'Monitor'])

function prettyKey(key: string) {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

function formatConfigValue(key: string, value: any) {
  if (DURATION_KEYS.has(key)) {
    const seconds = Math.round((Number(value) / 1e9) * 100) / 100
    return `${seconds}s`
  }
  if (key === 'MaxFailureRatio') return `${Math.round(Number(value) * 100)}%`
  if (key === 'MaxAttempts') return Number(value) > 0 ? String(value) : 'Unlimited'
  return String(value)
}

function configRows(config: any) {
  if (!config) return []
  return Object.entries(config)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({ key: prettyKey(key), value: formatConfigValue(key, value) }))
}
</script>

<template>
  <div>
    <DataState :status="status" :error="error" :refreshing="refreshing">
      <PageHeader :title="`Service ${name}`" :subtitle="summary.stack ? `Stack ${summary.stack}` : 'Standalone service'" icon="i-lucide-box">
        <template #actions>
          <div class="flex items-center gap-1.5 text-xs text-faint select-none">
            <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
            {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
          </div>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/services" label="Back" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
          <template v-if="can('operator')">
            <UButton icon="i-lucide-pencil" color="primary" label="Edit" @click="openEditModal('general')" />
            <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" label="Redeploy" @click="redeploy" />
            <UButton icon="i-lucide-trash-2" color="error" variant="soft" label="Delete" @click="remove" />
          </template>
        </template>
      </PageHeader>

      <div class="flex flex-wrap gap-1 mb-5 border-b border-hull">
        <button v-for="t in [{k:'overview',l:'Overview',i:'i-lucide-layout-dashboard'},{k:'logs',l:'Logs',i:'i-lucide-scroll-text'},{k:'history',l:'History',i:'i-lucide-history'}]" :key="t.k"
          @click="tab = t.k as any"
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition"
          :class="tab === t.k ? 'border-beacon text-foam' : 'border-transparent text-(--color-muted) hover:text-foam'">
          <UIcon :name="t.i" class="size-4" /> {{ t.l }}
        </button>
      </div>

      <div v-if="tab === 'overview'" class="grid gap-4 xl:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.6fr)]">
        <div class="space-y-4">
          <section class="panel p-4">
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge :state="summary.status" />
              <UBadge color="neutral" variant="subtle" :label="String(mode).toUpperCase()" />
              <UBadge v-if="summary.updateState" color="warning" variant="subtle" :label="summary.updateState" />
            </div>

            <div class="mt-6 grid grid-cols-3 gap-3 text-center">
              <div>
                <div class="summary-ring-wrap" :title="replicaDetail()">
                  <div class="summary-ring mx-auto size-20 sm:size-24" :style="fulfillmentRingStyle(replicaPercent())" tabindex="0" :aria-label="replicaDetail()">
                    <div class="summary-ring-inner">
                      <p class="font-mono text-sm font-semibold text-foam">{{ replicaLabel() }}</p>
                      <p class="text-[10px] leading-tight text-faint">replica</p>
                    </div>
                  </div>
                  <span class="summary-ring-tip">{{ replicaDetail() }}</span>
                </div>
              </div>
              <div>
                <div class="summary-ring-wrap" :title="cpuDetail()">
                  <div class="summary-ring mx-auto size-20 sm:size-24" :style="usageRingStyle(cpuRingPercent())" tabindex="0" :aria-label="cpuDetail()">
                    <div class="summary-ring-inner">
                      <p class="font-mono text-sm font-semibold text-foam">{{ cpuHeadline() }}</p>
                      <p class="text-[10px] leading-tight text-faint">vCPU</p>
                    </div>
                  </div>
                  <span class="summary-ring-tip">{{ cpuDetail() }}</span>
                </div>
              </div>
              <div>
                <div class="summary-ring-wrap" :title="memoryDetail()">
                  <div class="summary-ring mx-auto size-20 sm:size-24" :style="usageRingStyle(memoryRingPercent())" tabindex="0" :aria-label="memoryDetail()">
                    <div class="summary-ring-inner">
                      <p class="font-mono text-xs font-semibold text-foam">{{ memoryHeadline() }}</p>
                      <p class="text-[10px] leading-tight text-faint">RAM</p>
                    </div>
                  </div>
                  <span class="summary-ring-tip">{{ memoryDetail() }}</span>
                </div>
              </div>
            </div>

            <div v-if="currentUsage.available" class="mt-4 rounded-md bg-surface-2/70 px-3 py-2 text-center text-xs text-faint ring-1 ring-hull-soft">
              Current sample {{ relative(currentUsage.sampledAt) }} from {{ currentUsage.containers }} container(s)
            </div>

            <dl class="mt-6 divide-y divide-hull text-sm">
              <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">ID</dt><dd class="truncate font-mono text-(--color-muted)" :title="summary.id">{{ summary.id || '-' }}</dd></div>
              <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Registry</dt><dd class="truncate font-mono text-foam">{{ summary.registry || '-' }}</dd></div>
              <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Image</dt><dd class="truncate font-mono text-foam" :title="image">{{ image || '-' }}</dd></div>
              <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Created</dt><dd class="text-foam">{{ relative(summary.createdAt) }}</dd></div>
              <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Updated</dt><dd class="text-foam">{{ relative(summary.updatedAt) }}</dd></div>
              <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Resources</dt><dd class="font-mono text-(--color-muted)">{{ resourceBasis() }}</dd></div>
            </dl>

            <div class="mt-4 flex flex-wrap gap-2 border-t border-hull pt-3">
              <UButton v-if="stack" size="xs" color="primary" variant="ghost" icon="i-lucide-layers" label="See stack" :to="`/stacks/${stack}`" />
              <UButton size="xs" color="primary" variant="ghost" icon="i-lucide-scroll-text" label="View log" @click="viewLogs" />
            </div>
          </section>

          <section class="panel p-4">
            <div class="flex items-center justify-between gap-2">
              <h2 class="font-display text-lg font-semibold text-foam">Extra hosts</h2>
              <UButton v-if="can('operator')" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEditModal('network')" />
            </div>
            <div v-if="!extraHosts.length" class="mt-6 rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">
              No extra hosts defined for this service.
            </div>
            <div v-else class="mt-4 space-y-1 font-mono text-xs text-(--color-muted)">
              <p v-for="host in extraHosts" :key="host" class="break-all">{{ host }}</p>
            </div>
          </section>

          <section class="panel p-4">
            <div class="flex items-center justify-between gap-2">
              <h2 class="font-display text-lg font-semibold text-foam">Environment variables</h2>
              <UButton v-if="can('operator')" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEditModal('environment')" />
            </div>
            <div v-if="!envs.length" class="mt-6 rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">
              No environment variables defined.
            </div>
            <div v-else class="mt-4 max-h-72 space-y-1 overflow-auto font-mono text-xs">
              <p v-for="env in envs" :key="env.key" class="break-all text-(--color-muted)">
                <span class="text-beacon">{{ env.key }}</span>=<span class="text-faint">{{ env.value }}</span>
              </p>
            </div>
          </section>

          <section class="panel p-4">
            <h2 class="font-display text-lg font-semibold text-foam">Labels</h2>
            <div v-if="!labelEntries(serviceLabels).length && !labelEntries(containerLabels).length && !can('operator')" class="mt-6 rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">
              No custom labels defined.
            </div>
            <div v-else class="mt-4 space-y-3">
              <div>
                <div class="mb-2 flex items-center justify-between gap-2">
                  <p class="text-xs font-semibold uppercase text-faint">Service</p>
                  <UButton v-if="can('operator')" icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" @click="openEditModal('deployment')" />
                </div>
                <div v-if="labelEntries(serviceLabels).length" class="flex flex-wrap gap-2">
                  <span v-for="[k, v] in labelEntries(serviceLabels)" :key="k" class="rounded bg-surface-2 px-2 py-1 font-mono text-xs text-(--color-muted)">{{ k }}=<span class="text-foam">{{ v }}</span></span>
                </div>
                <p v-else class="text-xs text-faint">None</p>
              </div>
              <div>
                <div class="mb-2 flex items-center justify-between gap-2">
                  <p class="text-xs font-semibold uppercase text-faint">Container</p>
                </div>
                <div v-if="labelEntries(containerLabels).length" class="flex flex-wrap gap-2">
                  <span v-for="[k, v] in labelEntries(containerLabels)" :key="k" class="rounded bg-surface-2 px-2 py-1 font-mono text-xs text-(--color-muted)">{{ k }}=<span class="text-foam">{{ v }}</span></span>
                </div>
                <p v-else class="text-xs text-faint">None</p>
              </div>
            </div>
          </section>
        </div>

        <div class="space-y-4 min-w-0">
          <section class="panel p-0 overflow-hidden">
            <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <h2 class="font-display text-lg font-semibold text-foam">Tasks</h2>
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
                placeholder="Search service tasks"
              />
            </div>
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
                  <tr v-if="!filteredTasks.length">
                    <td colspan="6" class="px-4 py-8 text-center text-(--color-muted)">No tasks.</td>
                  </tr>
                  <tr
                    v-for="task in filteredTasks"
                    :key="task.id"
                    class="cursor-pointer align-top transition hover:bg-surface-2/60"
                    tabindex="0"
                    @click="navigateTo(`/tasks/${task.id}`)"
                    @keydown.enter="navigateTo(`/tasks/${task.id}`)"
                  >
                    <td class="px-4 py-3">
                      <p class="font-mono text-sm text-foam">{{ short(task.id, 8) }}</p>
                      <p class="mt-0.5 truncate font-mono text-xs text-faint">{{ task.image || '-' }}</p>
                    </td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ task.nodeName || short(task.nodeId, 8) || '-' }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ taskCpuLabel(task) }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ taskMemoryLabel(task) }}</td>
                    <td class="px-4 py-3 text-xs text-faint">{{ relative(task.timestamp) }}</td>
                    <td class="px-4 py-3"><StatusBadge :state="task.state" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="panel p-4">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 class="font-display text-lg font-semibold text-foam">Resource history</h2>
              <USelect v-model="range" :items="['1h', '6h', '24h', '7d']" size="xs" class="w-24" />
            </div>
            <div v-if="metricsError" class="rounded-lg border border-hull p-6 text-center text-sm text-(--color-muted)">
              Metrics are unavailable.
            </div>
            <ClientOnly v-else>
              <div v-if="!hasMetrics" class="rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">
                No service metrics for this range.
              </div>
              <div v-else class="grid gap-4 lg:grid-cols-3">
                <div>
                  <p class="mb-1 text-xs text-faint">CPU %</p>
                  <MetricsChart
                    :labels="historyLabels"
                    :datasets="[{ label: 'CPU', data: cpuSeries.map((p: any) => p.percent) }]"
                    :format-value="(n) => `${n.toFixed(1)}%`"
                    :height="180"
                  />
                </div>
                <div>
                  <p class="mb-1 text-xs text-faint">Memory</p>
                  <MetricsChart
                    :labels="historyLabels"
                    :datasets="[{ label: 'Used', data: memorySeries.map((p: any) => p.used) }]"
                    :format-value="bytes"
                    :height="180"
                  />
                </div>
                <div>
                  <p class="mb-1 text-xs text-faint">Network</p>
                  <MetricsChart
                    :labels="historyLabels"
                    :datasets="[
                      { label: 'Rx/s', data: networkSeries.map((p: any) => p.rxBytesPerSec) },
                      { label: 'Tx/s', data: networkSeries.map((p: any) => p.txBytesPerSec) }
                    ]"
                    :format-value="bytes"
                    :height="180"
                  />
                </div>
              </div>
            </ClientOnly>
          </section>

          <section class="panel p-0 overflow-hidden">
            <div class="flex items-center justify-between gap-2 px-4 py-3">
              <h2 class="font-display text-lg font-semibold text-foam">Networks</h2>
              <UButton v-if="can('operator')" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEditModal('network')" />
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead class="border-y border-hull text-xs uppercase tracking-wide text-faint">
                  <tr>
                    <th class="px-4 py-3 font-medium">Name</th>
                    <th class="px-4 py-3 font-medium">Driver</th>
                    <th class="px-4 py-3 font-medium">Subnet</th>
                    <th class="px-4 py-3 font-medium">Gateway</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-hull">
                  <tr v-if="!networks.length">
                    <td colspan="4" class="px-4 py-8 text-center text-(--color-muted)">No networks.</td>
                  </tr>
                  <tr v-for="network in networks" :key="network.id">
                    <td class="px-4 py-3 font-mono text-sm text-foam">{{ network.name || '-' }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ network.driver || '-' }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ listLabel(network.subnets) }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ listLabel(network.gateways) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="panel p-0 overflow-hidden">
            <div class="flex items-center justify-between gap-2 px-4 py-3">
              <h2 class="font-display text-lg font-semibold text-foam">Ports</h2>
              <UButton v-if="can('operator')" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEditModal('network')" />
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead class="border-y border-hull text-xs uppercase tracking-wide text-faint">
                  <tr>
                    <th class="px-4 py-3 font-medium">Container port</th>
                    <th class="px-4 py-3 font-medium">Protocol</th>
                    <th class="px-4 py-3 font-medium">Mode</th>
                    <th class="px-4 py-3 font-medium">Host port</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-hull">
                  <tr v-if="!ports.length">
                    <td colspan="4" class="px-4 py-8 text-center text-(--color-muted)">No published ports.</td>
                  </tr>
                  <tr v-for="(port, i) in ports" :key="i">
                    <td class="px-4 py-3 font-mono text-sm text-foam">{{ port.target || '-' }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ port.protocol || '-' }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ port.mode || summary.endpointMode || '-' }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ port.published || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="panel p-0 overflow-hidden">
            <div class="flex items-center justify-between gap-2 px-4 py-3">
              <h2 class="font-display text-lg font-semibold text-foam">Mounts</h2>
              <UButton v-if="can('operator')" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEditModal('environment')" />
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-left text-sm">
                <thead class="border-y border-hull text-xs uppercase tracking-wide text-faint">
                  <tr>
                    <th class="px-4 py-3 font-medium">Container path</th>
                    <th class="px-4 py-3 font-medium">Source</th>
                    <th class="px-4 py-3 font-medium">Type</th>
                    <th class="px-4 py-3 font-medium">Read only</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-hull">
                  <tr v-if="!mounts.length">
                    <td colspan="4" class="px-4 py-8 text-center text-(--color-muted)">No mounts.</td>
                  </tr>
                  <tr v-for="(mount, i) in mounts" :key="i">
                    <td class="px-4 py-3 font-mono text-sm text-foam">{{ mount.target || '-' }}</td>
                    <td class="px-4 py-3 max-w-sm truncate font-mono text-xs text-(--color-muted)" :title="mount.source">{{ mount.source || '-' }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ mount.type || '-' }}</td>
                    <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ mount.readOnly ? 'yes' : 'no' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div class="grid gap-4 lg:grid-cols-2">
            <section class="panel p-4">
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-display text-lg font-semibold text-foam">Secrets</h2>
                <UButton v-if="can('operator')" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEditModal('environment')" />
              </div>
              <div v-if="!secrets.length" class="mt-6 rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">No secrets.</div>
              <div v-else class="mt-4 divide-y divide-hull">
                <div v-for="secret in secrets" :key="secret.id || secret.name" class="py-3">
                  <p class="font-mono text-sm text-foam">{{ secret.name || '-' }}</p>
                  <p class="mt-1 font-mono text-xs text-faint">{{ secret.fileName || '-' }}</p>
                </div>
              </div>
            </section>
            <section class="panel p-4">
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-display text-lg font-semibold text-foam">Configs</h2>
                <UButton v-if="can('operator')" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEditModal('environment')" />
              </div>
              <div v-if="!configs.length" class="mt-6 rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">No configs.</div>
              <div v-else class="mt-4 divide-y divide-hull">
                <div v-for="config in configs" :key="config.id || config.name" class="py-3">
                  <p class="font-mono text-sm text-foam">{{ config.name || '-' }}</p>
                  <p class="mt-1 font-mono text-xs text-faint">{{ config.fileName || '-' }}</p>
                </div>
              </div>
            </section>
          </div>

          <div class="grid gap-4 lg:grid-cols-2">
            <section class="panel p-4">
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-display text-lg font-semibold text-foam">Resources</h2>
                <UButton v-if="can('operator')" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEditModal('resources')" />
              </div>
              <dl class="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div><dt class="text-faint">CPU reservation</dt><dd class="font-mono text-foam">{{ formatNanoCpus(resources.reservedNanoCpus) }}</dd></div>
                <div><dt class="text-faint">CPU limit</dt><dd class="font-mono text-foam">{{ formatNanoCpus(resources.limitNanoCpus) }}</dd></div>
                <div><dt class="text-faint">Memory reservation</dt><dd class="font-mono text-foam">{{ formatBytes(resources.reservedMemoryBytes) }}</dd></div>
                <div><dt class="text-faint">Memory limit</dt><dd class="font-mono text-foam">{{ formatBytes(resources.limitMemoryBytes) }}</dd></div>
              </dl>
            </section>
            <section class="panel p-4">
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-display text-lg font-semibold text-foam">Log driver</h2>
                <UButton v-if="can('operator')" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEditModal('logs')" />
              </div>
              <div v-if="!data?.logDriver" class="mt-6 rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">Default driver.</div>
              <div v-else class="mt-4 text-xs">
                <p class="font-mono text-foam">{{ data.logDriver.name }}</p>
                <dl v-if="Object.keys(data.logDriver.options || {}).length" class="mt-2 space-y-1">
                  <div v-for="[k, v] in Object.entries(data.logDriver.options)" :key="k" class="flex justify-between gap-3">
                    <dt class="text-faint">{{ k }}</dt>
                    <dd class="font-mono text-(--color-muted)">{{ v }}</dd>
                  </div>
                </dl>
              </div>
            </section>
          </div>

          <section class="panel p-4">
            <div class="flex items-center justify-between gap-2">
              <h2 class="font-display text-lg font-semibold text-foam">Deployment</h2>
              <UButton v-if="can('operator')" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEditModal('deployment')" />
            </div>
            <div class="mt-4 space-y-4 text-xs">
              <div class="flex items-center justify-between">
                <span class="text-faint">Autoredeploy</span>
                <span class="font-mono" :class="data?.autoredeploy ? 'status-running' : 'text-(--color-muted)'">{{ data?.autoredeploy ? 'enabled' : 'disabled' }}</span>
              </div>
              <div>
                <p class="mb-2 font-semibold uppercase text-faint">Placements</p>
                <div v-if="data?.placement?.Constraints?.length" class="flex flex-wrap gap-1.5">
                  <span v-for="c in data.placement.Constraints" :key="c" class="rounded bg-surface-2 px-2 py-1 font-mono text-(--color-muted)">{{ c }}</span>
                </div>
                <p v-else class="text-faint">None</p>
              </div>
              <div class="grid gap-4 sm:grid-cols-3">
                <div>
                  <p class="mb-2 font-semibold uppercase text-faint">Restart policy</p>
                  <dl class="space-y-1">
                    <div v-for="row in configRows(data?.restartPolicy)" :key="`restart-${row.key}`" class="flex justify-between gap-3">
                      <dt class="text-faint">{{ row.key }}</dt>
                      <dd class="font-mono text-(--color-muted)">{{ row.value }}</dd>
                    </div>
                    <p v-if="!configRows(data?.restartPolicy).length" class="text-faint">Default</p>
                  </dl>
                </div>
                <div>
                  <p class="mb-2 font-semibold uppercase text-faint">Update config</p>
                  <dl class="space-y-1">
                    <div v-for="row in configRows(data?.updateConfig)" :key="`update-${row.key}`" class="flex justify-between gap-3">
                      <dt class="text-faint">{{ row.key }}</dt>
                      <dd class="font-mono text-(--color-muted)">{{ row.value }}</dd>
                    </div>
                    <p v-if="!configRows(data?.updateConfig).length" class="text-faint">Default</p>
                  </dl>
                </div>
                <div>
                  <p class="mb-2 font-semibold uppercase text-faint">Rollback config</p>
                  <dl class="space-y-1">
                    <div v-for="row in configRows(data?.rollbackConfig)" :key="`rollback-${row.key}`" class="flex justify-between gap-3">
                      <dt class="text-faint">{{ row.key }}</dt>
                      <dd class="font-mono text-(--color-muted)">{{ row.value }}</dd>
                    </div>
                    <p v-if="!configRows(data?.rollbackConfig).length" class="text-faint">Default</p>
                  </dl>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div v-else-if="tab === 'logs'" class="panel p-0 overflow-hidden">
        <div class="flex items-center justify-between gap-2 border-b border-hull px-4 py-2.5">
          <span class="flex items-center gap-2 text-xs text-(--color-muted)"><UIcon name="i-lucide-scroll-text" class="size-4" /> Last {{ tail }} lines</span>
          <div class="flex gap-2">
            <USelect v-model="tail" :items="[100, 200, 500, 1000]" size="xs" @update:model-value="loadLogs" />
            <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-refresh-cw" :loading="logsLoading" @click="loadLogs" />
          </div>
        </div>
        <div v-if="logsLoading && !logs" class="flex items-center justify-center py-16 text-(--color-muted)">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mr-2" /> Streaming...
        </div>
        <pre v-else class="logstream max-h-[60vh] overflow-auto px-4 py-3 text-xs whitespace-pre-wrap">{{ logs || 'No log output.' }}</pre>
      </div>

      <div v-else-if="tab === 'history'" class="space-y-2">
        <div v-if="historyLoading && !statusEvents.length" class="flex items-center justify-center py-16 text-(--color-muted)">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mr-2" /> Loading...
        </div>
        <div v-else-if="!statusEvents.length" class="panel p-10 text-center text-sm text-(--color-muted)">No status history yet.</div>
        <div v-else v-for="(event, i) in statusEvents" :key="i" class="panel-flush p-3 flex items-center justify-between gap-3 text-sm">
          <div class="flex items-center gap-3 min-w-0">
            <StatusBadge :state="event.status" />
            <span v-if="event.taskId" class="font-mono text-xs text-faint truncate">task {{ short(event.taskId) }}</span>
            <span v-if="event.message" class="text-xs text-faint truncate">{{ event.message }}</span>
          </div>
          <span class="text-xs text-faint shrink-0">{{ relative(event.time) }}</span>
        </div>
      </div>
    </DataState>

    <ServicesEditServiceModal
      v-model:open="editModalOpen"
      :service-id="id"
      :data="data"
      :initial-tab="editModalTab"
      @saved="onServiceSaved"
    />
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

.summary-ring-tip {
  position: absolute;
  bottom: calc(100% + 0.55rem);
  left: 50%;
  z-index: 20;
  width: max-content;
  max-width: min(18rem, 82vw);
  transform: translate(-50%, 0.25rem);
  border-radius: 0.375rem;
  background: var(--color-abyss);
  color: var(--color-foam);
  opacity: 0;
  padding: 0.45rem 0.6rem;
  pointer-events: none;
  text-align: left;
  font-size: 0.75rem;
  line-height: 1.3;
  border: 1px solid var(--color-hull);
  box-shadow: var(--panel-shadow-soft);
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.summary-ring-wrap:hover .summary-ring-tip,
.summary-ring:focus-visible + .summary-ring-tip {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>
