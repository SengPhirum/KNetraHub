<script setup lang="ts">
const { bytes, cpus } = useFormat()
const { prefs } = usePreferences()

const { data, status, error, refreshing, refresh } = useApiCache('dashboard', async () => {
  const [overview, nodeUsage, metrics] = await Promise.all([
    $fetch('/api/system/overview'),
    $fetch('/api/nodes/usage'),
    $fetch('/api/system/metrics', { query: { range: '6h' } })
  ])
  return { overview, nodeUsage, metrics }
})
onMounted(refresh)

const { connected } = useDockerEvents((evt) => {
  if (['service', 'task', 'node', 'container'].includes(evt.type)) refresh()
})

useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const d = computed(() => (data.value as any)?.overview)
const nodeUsage = computed<any[]>(() => (data.value as any)?.nodeUsage?.nodes || [])
const metricData = computed(() => (data.value as any)?.metrics)

const taskOrder = ['running', 'pending', 'preparing', 'starting', 'complete', 'shutdown', 'failed', 'rejected']
const taskEntries = computed(() =>
  Object.entries(d.value?.taskStates || {}).sort((a, b) => taskOrder.indexOf(a[0]) - taskOrder.indexOf(b[0]))
)

const chartPalette = ['#48b461', '#ff9838', '#2496ed', '#ef5964', '#a78bfa', '#9b6f5f', '#ec78c4', '#8a8f98']

const availableNodeUsage = computed(() => nodeUsage.value.filter((node: any) => node.available))
const diskUsedBytes = computed(() => availableNodeUsage.value.reduce((sum, node: any) => sum + Number(node.disk?.usedBytes || 0), 0))
const diskTotalBytes = computed(() => availableNodeUsage.value.reduce((sum, node: any) => sum + Number(node.disk?.totalBytes || 0), 0))
const memoryUsedBytes = computed(() => availableNodeUsage.value.reduce((sum, node: any) => sum + Number(node.memory?.usedBytes || 0), 0))
const memoryTotalBytes = computed(() => {
  const liveTotal = availableNodeUsage.value.reduce((sum, node: any) => sum + Number(node.memory?.totalBytes || 0), 0)
  return liveTotal || Number(d.value?.capacity?.memoryBytes || 0)
})
const cpuUsedCores = computed(() => availableNodeUsage.value.reduce((sum, node: any) => sum + Number(node.cpu?.cores || 0), 0))
const cpuTotalCores = computed(() => Number(d.value?.capacity?.cpus || 0))

const diskPercent = computed(() => ratioPercent(diskUsedBytes.value, diskTotalBytes.value))
const memoryPercent = computed(() => ratioPercent(memoryUsedBytes.value, memoryTotalBytes.value))
const cpuPercent = computed(() => ratioPercent(cpuUsedCores.value, cpuTotalCores.value))

const serviceMetrics = computed<any[]>(() => metricData.value?.services || [])
const nodeMetrics = computed<any[]>(() => metricData.value?.nodes || [])

const memoryByService = computed(() =>
  buildUsageChart(serviceMetrics.value, 'serviceId', 'serviceName', 'memoryUsedBytes', {
    transform: (value) => value / 1024 / 1024
  })
)
const cpuByService = computed(() =>
  buildUsageChart(serviceMetrics.value, 'serviceId', 'serviceName', 'cpuPercent', {
    transform: (value) => value / 100
  })
)
const memoryByNode = computed(() => buildUsageChart(nodeMetrics.value, 'nodeId', 'hostname', 'memoryPercent'))
const cpuByNode = computed(() => buildUsageChart(nodeMetrics.value, 'nodeId', 'hostname', 'cpuPercent'))

function ratioPercent(used: number, total: number) {
  return total > 0 ? (used / total) * 100 : 0
}

function clampPercent(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function ringStyle(percent?: number | null) {
  const safe = clampPercent(percent)
  return {
    background: `conic-gradient(var(--color-running) ${safe}%, color-mix(in srgb, var(--color-hull) 76%, var(--color-surface-2)) 0)`
  }
}

function compactBytes(value?: number | null) {
  return bytes(value).replace(/\s+/g, '')
}

function formatCores(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '0'
  return value.toFixed(value >= 10 ? 1 : 2)
}

function plural(count: number, singular: string) {
  return `${singular}${count === 1 ? '' : 's'}`
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function normalizedTime(value: string | Date | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function buildUsageChart(
  rows: any[],
  keyField: string,
  labelField: string,
  valueField: string,
  options: { limit?: number; transform?: (value: number, row: any) => number } = {}
) {
  const limit = options.limit ?? 8
  const times = Array.from(new Set(rows.map((row) => normalizedTime(row.time)).filter(Boolean))).sort()
  const totals = new Map<string, number>()
  const labels = new Map<string, string>()

  for (const row of rows) {
    const key = String(row[keyField] || '')
    if (!key) continue
    const value = options.transform ? options.transform(Number(row[valueField] || 0), row) : Number(row[valueField] || 0)
    totals.set(key, (totals.get(key) || 0) + Math.abs(value))
    labels.set(key, row[labelField] || key)
  }

  const keys = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key)

  const datasets = keys.map((key, index) => {
    const values = new Map<string, number>()
    for (const row of rows) {
      if (String(row[keyField] || '') !== key) continue
      const time = normalizedTime(row.time)
      if (!time) continue
      values.set(time, options.transform ? options.transform(Number(row[valueField] || 0), row) : Number(row[valueField] || 0))
    }

    return {
      label: labels.get(key) || key,
      data: times.map((time) => values.get(time) ?? null),
      color: chartPalette[index % chartPalette.length]
    }
  })

  return {
    labels: times.map(timeLabel),
    datasets
  }
}

function formatMiB(value: number) {
  if (value >= 1024) return `${(value / 1024).toFixed(value >= 10240 ? 0 : 1)} GiB`
  return `${value.toFixed(value >= 100 ? 0 : 1)} MiB`
}

function formatPercent(value: number) {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`
}

function formatVcpu(value: number) {
  return value.toFixed(value >= 10 ? 1 : 2)
}
</script>

<template>
  <div>
    <PageHeader title="Bridge" subtitle="Live overview of the swarm" icon="i-lucide-radar">
      <template #actions>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" label="Refresh" :loading="refreshing" @click="refresh()" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :refreshing="refreshing">
      <div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <section class="panel dashboard-kpi p-5">
          <div>
            <p class="dashboard-kpi-label">Cluster</p>
            <p class="dashboard-kpi-value">{{ d?.nodes?.total ?? 0 }} nodes</p>
          </div>
          <div class="space-y-2">
            <span class="dashboard-count-pill">
              <span>{{ d?.nodes?.managers ?? 0 }}</span>
              {{ plural(d?.nodes?.managers ?? 0, 'manager') }}
            </span>
            <span class="dashboard-count-pill">
              <span>{{ d?.nodes?.workers ?? 0 }}</span>
              {{ plural(d?.nodes?.workers ?? 0, 'worker') }}
            </span>
          </div>
        </section>

        <section class="panel dashboard-kpi p-5">
          <div>
            <p class="dashboard-kpi-label">Disk</p>
            <p class="dashboard-kpi-value">{{ compactBytes(diskUsedBytes) }}</p>
          </div>
          <div class="dashboard-ring size-20" :style="ringStyle(diskPercent)">
            <div class="dashboard-ring-inner">
              <p>{{ compactBytes(diskTotalBytes) }}</p>
              <span>size</span>
            </div>
          </div>
        </section>

        <section class="panel dashboard-kpi p-5">
          <div>
            <p class="dashboard-kpi-label">Memory</p>
            <p class="dashboard-kpi-value">{{ compactBytes(memoryUsedBytes) }}</p>
          </div>
          <div class="dashboard-ring size-20" :style="ringStyle(memoryPercent)">
            <div class="dashboard-ring-inner">
              <p>{{ compactBytes(memoryTotalBytes) }}</p>
              <span>ram</span>
            </div>
          </div>
        </section>

        <section class="panel dashboard-kpi p-5">
          <div>
            <p class="dashboard-kpi-label">CPU</p>
            <p class="dashboard-kpi-value">{{ formatCores(cpuUsedCores) }}</p>
          </div>
          <div class="dashboard-ring size-20" :style="ringStyle(cpuPercent)">
            <div class="dashboard-ring-inner">
              <p>{{ Math.round(cpuTotalCores) }}</p>
              <span>vCPU</span>
            </div>
          </div>
        </section>
      </div>

      <div class="mt-6 grid gap-4 xl:grid-cols-2">
        <DashboardUsagePanel
          title="Memory usage by Service"
          :labels="memoryByService.labels"
          :datasets="memoryByService.datasets"
          :format-value="formatMiB"
          y-title="[MiB]"
        />
        <DashboardUsagePanel
          title="CPU usage by Service"
          :labels="cpuByService.labels"
          :datasets="cpuByService.datasets"
          :format-value="formatVcpu"
          y-title="[vCPU]"
        />
        <DashboardUsagePanel
          title="Memory utilization by Node"
          :labels="memoryByNode.labels"
          :datasets="memoryByNode.datasets"
          :format-value="formatPercent"
          y-title="[%]"
        />
        <DashboardUsagePanel
          title="CPU utilization by Node"
          :labels="cpuByNode.labels"
          :datasets="cpuByNode.datasets"
          :format-value="formatPercent"
          y-title="[%]"
        />
      </div>

      <section class="panel mt-6 p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">The fleet</h2>
          <NuxtLink to="/nodes" class="text-xs text-beacon hover:underline">Manage nodes -></NuxtLink>
        </div>
        <div v-if="!d?.nodeList?.length" class="text-sm text-(--color-muted) py-2">No nodes visible.</div>
        <div v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <NuxtLink
            v-for="node in d?.nodeList"
            :key="node.id"
            :to="`/nodes/${node.id}`"
            class="panel-flush flex items-center gap-3 p-3.5 transition hover:ring-1 hover:ring-beacon/30"
          >
            <span
              class="flex size-10 items-center justify-center rounded-lg ring-1"
              :class="node.leader ? 'sonar bg-beacon/15 ring-beacon/40' : 'bg-surface-2 ring-hull'"
            >
              <UIcon
                :name="node.role === 'manager' ? 'i-lucide-anchor' : 'i-lucide-box'"
                class="size-5"
                :class="node.leader ? 'text-beacon' : 'text-(--color-muted)'"
              />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="truncate font-medium text-foam">{{ node.hostname || '-' }}</p>
                <span v-if="node.leader" class="rounded bg-beacon/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-beacon">Leader</span>
              </div>
              <p class="mt-0.5 truncate font-mono text-xs text-faint">
                {{ node.role || '-' }} &middot; {{ cpus(node.cpus) }} &middot; {{ bytes(node.memory) }}
              </p>
            </div>
            <StatusBadge :state="node.state" />
          </NuxtLink>
        </div>
      </section>

      <section class="panel mt-6 p-5">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-4">Task distribution</h2>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="[state, count] in taskEntries"
            :key="state"
            class="panel-flush flex items-center gap-2.5 px-3 py-2"
          >
            <StatusBadge :state="state" />
            <span class="font-mono text-sm font-semibold text-foam">{{ count }}</span>
          </div>
          <p v-if="!taskEntries.length" class="text-sm text-(--color-muted)">No tasks scheduled.</p>
        </div>
        <p class="mt-4 font-mono text-xs text-faint">
          Docker {{ d?.swarm?.dockerVersion || '-' }} &middot; swarm {{ (d?.swarm?.id || '').slice(0, 12) || '-' }}
        </p>
      </section>
    </DataState>
  </div>
</template>

<style scoped>
.dashboard-kpi {
  display: flex;
  min-height: 8.75rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.dashboard-kpi-label {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1rem;
  text-transform: uppercase;
  color: var(--color-muted);
}

.dashboard-kpi-value {
  margin-top: 0.35rem;
  font-family: var(--font-display);
  font-size: 1.55rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-foam);
}

.dashboard-count-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-hull) 42%, var(--color-surface-2));
  padding: 0.35rem 0.75rem 0.35rem 0.35rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-foam);
}

.dashboard-count-pill span {
  display: grid;
  min-width: 1.45rem;
  height: 1.45rem;
  place-items: center;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-muted) 18%, var(--color-surface));
  color: var(--color-muted);
}

.dashboard-ring {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  padding: 0.45rem;
}

.dashboard-ring-inner {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  background: var(--color-surface);
  text-align: center;
}

.dashboard-ring-inner p {
  max-width: 4rem;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-display);
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1.05;
  color: var(--color-foam);
}

.dashboard-ring-inner span {
  margin-top: 0.1rem;
  font-size: 0.68rem;
  line-height: 0.85rem;
  color: var(--color-muted);
}
</style>
