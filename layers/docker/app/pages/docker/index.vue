<script setup lang="ts">
// Dock app dashboard (the "Dock" app = Docker Swarm management). This is the
// former portal home; it moved to /dock when the home page became the app
// launcher. Access is gated by the appAccess.global client middleware and the
// server-side appAccess middleware (docker entitlement required).
import { GridLayout, GridItem } from 'grid-layout-plus'
import type { DashboardGridItem } from '~~/app/composables/usePreferences'

const { bytes } = useFormat()
const { prefs, updatePreferences } = usePreferences()

// Split into two independent fetches rather than one combined Promise.all:
// overview + nodeUsage resolve in ~100-200ms and drive the top panel (Overview
// rings, Task distribution), but /api/system/metrics (6h history for the 4
// charts below) is a much heavier query - bundling it into the same fetch
// meant the whole page, including content that had nothing to do with it,
// waited on the slowest of the three. Now the top panel renders as soon as
// its own data is back; the charts below independently show their own
// "waiting for data" state (already built into DashboardUsagePanel) until
// the metrics call resolves.
const { data: summary, status, error, refreshing, refresh: refreshSummary } = useApiCache('dashboard-summary', async () => {
  const [overview, nodeUsage] = await Promise.all([
    $fetch('/api/system/overview'),
    $fetch('/api/nodes/usage')
  ])
  return { overview, nodeUsage }
})
const { data: metrics, refreshing: metricsRefreshing, refresh: refreshMetrics } = useApiCache('dashboard-metrics', () =>
  $fetch('/api/system/metrics', { query: { range: '6h' } })
)

async function refresh() {
  await Promise.all([refreshSummary(), refreshMetrics()])
}
onMounted(refresh)

// After the first load above, real-time updates arrive as server-pushed data
// on the SSE stream (see server/utils/dashboardSnapshot.ts) - applied
// directly to state below, no re-$fetch involved. useIntervalFn only exists
// as a fallback for when the push connection itself is down.
const { connected } = useDockerEvents((evt) => {
  if (evt.type === 'dashboard-overview') summary.value = { ...(summary.value as any), overview: evt.data }
  else if (evt.type === 'dashboard-nodeUsage') summary.value = { ...(summary.value as any), nodeUsage: evt.data }
  else if (evt.type === 'dashboard-metrics') metrics.value = evt.data
})

useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const d = computed(() => (summary.value as any)?.overview)
const nodeUsage = computed<any[]>(() => (summary.value as any)?.nodeUsage?.nodes || [])
const metricData = computed(() => metrics.value as any)
const buttonRefreshing = computed(() => refreshing.value || metricsRefreshing.value)

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
    transform: (value) => value / 1024 / 1024,
    tooltip: (value, row) => {
      const limit = Number(row.limitMemoryBytes || 0)
      const allocated = limit || Number(row.nodeMemoryBytes || row.memoryLimitBytes || 0)
      const basis = limit ? '( Resource Limit )' : '(Node allocated)'
      return allocated
        ? `${formatMiB(value)} / ${formatMiB(allocated / 1024 / 1024)} ${basis}`
        : `${formatMiB(value)} / unavailable (Node allocated)`
    }
  })
)
const cpuByService = computed(() =>
  buildUsageChart(serviceMetrics.value, 'serviceId', 'serviceName', 'cpuPercent', {
    transform: (value) => value / 100,
    tooltip: (value, row) => {
      const limit = Number(row.limitCpuNanos || 0)
      const allocated = limit || Number(row.nodeCpuNanos || 0)
      const basis = limit ? '( Resource Limit )' : '( Node allocated )'
      return allocated
        ? `${formatVcpu(value)} vCPU / ${formatVcpu(allocated / 1e9)} vCPU ${basis}`
        : `${formatVcpu(value)} vCPU / unavailable ( Node allocated )`
    }
  })
)
const memoryByNode = computed(() => buildUsageChart(nodeMetrics.value, 'nodeId', 'hostname', 'memoryPercent', {
  tooltip: (value, row) => {
    const allocated = Number(row.nodeMemoryBytes || row.memoryLimitBytes || 0)
    return allocated
      ? `${formatPercent(value)} of ${compactBytes(allocated)}`
      : formatPercent(value)
  }
}))
const cpuByNode = computed(() => buildUsageChart(nodeMetrics.value, 'nodeId', 'hostname', 'cpuPercent', {
  tooltip: (value, row) => {
    const allocated = Number(row.nodeCpuNanos || 0)
    return allocated
      ? `${formatPercent(value)} of ${formatVcpu(allocated / 1e9)} vCPU`
      : formatPercent(value)
  }
}))

function ratioPercent(used: number, total: number) {
  return total > 0 ? (used / total) * 100 : 0
}

const { usageRingStyle } = useUsageRing()
function ringStyle(percent?: number | null) {
  return usageRingStyle(percent, { hullPercent: 76 })
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
  options: {
    limit?: number
    transform?: (value: number, row: any) => number
    tooltip?: (value: number, row: any) => string
  } = {}
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
    const tooltips = new Map<string, string>()
    for (const row of rows) {
      if (String(row[keyField] || '') !== key) continue
      const time = normalizedTime(row.time)
      if (!time) continue
      const value = options.transform ? options.transform(Number(row[valueField] || 0), row) : Number(row[valueField] || 0)
      values.set(time, value)
      if (options.tooltip) tooltips.set(time, options.tooltip(value, row))
    }

    return {
      label: labels.get(key) || key,
      data: times.map((time) => values.get(time) ?? null),
      tooltip: times.map((time) => tooltips.get(time) ?? null),
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

// ── Overview + Task distribution grid (drag/resize, saved per user) ────────
// Mirrors the Monitoring app's grid-layout-plus dashboard (see
// layers/monitoring/app/pages/monitoring/index.vue), scoped down to this
// page's two fixed boxes - no widget gallery/multiple dashboards needed here,
// just "let the user drag/resize these two and remember it".
const DASHBOARD_COLS = 12
const DASHBOARD_ROW_HEIGHT = 36
const DASHBOARD_MARGIN = 12
const DEFAULT_LAYOUT: DashboardGridItem[] = [
  { i: 'summary', x: 0, y: 0, w: 7, h: 4 },
  { i: 'tasks', x: 7, y: 0, w: 5, h: 4 }
]

function cloneLayout(items: DashboardGridItem[]): DashboardGridItem[] {
  return items.map((item) => ({ ...item }))
}

const editing = ref(false)
const layout = ref<DashboardGridItem[]>(cloneLayout(DEFAULT_LAYOUT))
const dirty = ref(false)
let loadingLayout = false

// grid-layout-plus's own container element doesn't reliably report a height
// that matches its (absolutely-positioned) items once wrapped in ClientOnly -
// it under-reports, which let the charts section below start before the top
// boxes actually ended. Compute the real height ourselves from the layout
// array (same formula the library uses: rows * rowHeight + gaps * margin) and
// size an explicit wrapper with it, so the flex column always reserves the
// right amount of space - including live as the user drags/resizes.
const topGridHeightPx = computed(() => {
  const maxRow = layout.value.reduce((max, item) => Math.max(max, item.y + item.h), 0)
  if (maxRow <= 0) return 0
  return maxRow * DASHBOARD_ROW_HEIGHT + Math.max(0, maxRow - 1) * DASHBOARD_MARGIN
})

watch(() => prefs.value.dashboards?.docker, (saved) => {
  loadingLayout = true
  layout.value = saved?.length ? cloneLayout(saved) : cloneLayout(DEFAULT_LAYOUT)
  dirty.value = false
  nextTick(() => { loadingLayout = false })
}, { immediate: true })

// grid-layout-plus mutates layout items on drag/resize - flag unsaved changes.
watch(layout, () => { if (!loadingLayout && editing.value) dirty.value = true }, { deep: true })

function startEdit() { editing.value = true }
function cancelEdit() {
  loadingLayout = true
  const saved = prefs.value.dashboards?.docker
  layout.value = saved?.length ? cloneLayout(saved) : cloneLayout(DEFAULT_LAYOUT)
  dirty.value = false
  editing.value = false
  nextTick(() => { loadingLayout = false })
}
function resetLayout() {
  layout.value = cloneLayout(DEFAULT_LAYOUT)
  dirty.value = true
}
async function saveLayout() {
  await updatePreferences({ dashboards: { ...(prefs.value.dashboards || {}), docker: layout.value } })
  dirty.value = false
  editing.value = false
}

// ── Task distribution status → detail popup ─────────────────────────────────
const taskModalOpen = ref(false)
const activeTaskState = ref('')
const modalTasks = ref<any[]>([])
const modalLoading = ref(false)

async function openTaskStatus(state: string) {
  if (editing.value) return
  activeTaskState.value = state
  taskModalOpen.value = true
  modalLoading.value = true
  modalTasks.value = []
  try {
    const all = await $fetch<any[]>('/api/tasks')
    modalTasks.value = all.filter((t: any) => t.state === state)
  } catch {
    modalTasks.value = []
  } finally {
    modalLoading.value = false
  }
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
        <template v-if="!editing">
          <UButton icon="i-lucide-layout-grid" color="neutral" variant="ghost" label="Edit layout" @click="startEdit" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" label="Refresh" :loading="buttonRefreshing" @click="refresh()" />
        </template>
        <template v-else>
          <UButton icon="i-lucide-rotate-ccw" color="neutral" variant="ghost" label="Reset" @click="resetLayout" />
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" label="Cancel" @click="cancelEdit" />
          <UButton icon="i-lucide-check" color="primary" label="Save layout" :disabled="!dirty" @click="saveLayout" />
        </template>
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :refreshing="refreshing">
      <div class="flex h-[calc(100dvh-9.375rem)] flex-col gap-4">
        <div v-if="editing" class="flex items-center gap-2 rounded-lg border border-beacon/30 bg-beacon/10 px-3 py-2 text-xs text-(--color-muted)">
          <UIcon name="i-lucide-move" class="size-4 text-beacon" />
          Drag boxes by their title bar, resize from the bottom-right corner. {{ dirty ? 'Unsaved changes.' : '' }}
        </div>

        <div class="shrink-0" :style="{ height: topGridHeightPx + 'px' }">
        <ClientOnly>
          <GridLayout
            v-model:layout="layout"
            :col-num="DASHBOARD_COLS"
            :row-height="DASHBOARD_ROW_HEIGHT"
            :is-draggable="editing"
            :is-resizable="editing"
            :margin="[12, 12]"
            :responsive="false"
            vertical-compact
            class="-m-1.5"
          >
            <GridItem
              v-for="item in layout"
              :key="item.i"
              :x="item.x"
              :y="item.y"
              :w="item.w"
              :h="item.h"
              :i="item.i"
              :min-w="item.i === 'summary' ? 6 : 4"
              :min-h="3"
              drag-allow-from=".widget-drag"
            >
              <section v-if="item.i === 'summary'" class="panel flex h-full flex-col overflow-hidden">
                <div class="widget-drag flex items-center gap-2 border-b border-surface px-3 py-2" :class="editing ? 'cursor-move select-none' : ''">
                  <UIcon name="i-lucide-gauge" class="size-4 shrink-0 text-faint" />
                  <span class="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">Overview</span>
                </div>
                <div class="min-h-0 flex-1 overflow-auto p-3">
                  <div class="grid h-full grid-cols-2 gap-3 md:grid-cols-4">
                    <div class="stat-tile">
                      <div class="stat-tile-head">
                        <UIcon name="i-lucide-boxes" class="size-3.5" />
                        <span>Cluster</span>
                      </div>
                      <div class="stat-tile-body">
                        <p class="stat-tile-figure">{{ d?.nodes?.total ?? 0 }}</p>
                        <p class="stat-tile-figure-caption">nodes</p>
                      </div>
                      <p class="stat-tile-foot">
                        {{ d?.nodes?.managers ?? 0 }} {{ plural(d?.nodes?.managers ?? 0, 'manager') }} · {{ d?.nodes?.workers ?? 0 }} {{ plural(d?.nodes?.workers ?? 0, 'worker') }}
                      </p>
                    </div>

                    <div class="stat-tile">
                      <div class="stat-tile-head">
                        <UIcon name="i-lucide-hard-drive" class="size-3.5" />
                        <span>Disk</span>
                      </div>
                      <div class="stat-tile-body">
                        <div class="dashboard-ring size-16" :style="ringStyle(diskPercent)">
                          <div class="dashboard-ring-inner">
                            <p>{{ formatPercent(diskPercent) }}</p>
                          </div>
                        </div>
                      </div>
                      <p class="stat-tile-foot">{{ compactBytes(diskUsedBytes) }} of {{ compactBytes(diskTotalBytes) }}</p>
                    </div>

                    <div class="stat-tile">
                      <div class="stat-tile-head">
                        <UIcon name="i-lucide-memory-stick" class="size-3.5" />
                        <span>Memory</span>
                      </div>
                      <div class="stat-tile-body">
                        <div class="dashboard-ring size-16" :style="ringStyle(memoryPercent)">
                          <div class="dashboard-ring-inner">
                            <p>{{ formatPercent(memoryPercent) }}</p>
                          </div>
                        </div>
                      </div>
                      <p class="stat-tile-foot">{{ compactBytes(memoryUsedBytes) }} of {{ compactBytes(memoryTotalBytes) }}</p>
                    </div>

                    <div class="stat-tile">
                      <div class="stat-tile-head">
                        <UIcon name="i-lucide-cpu" class="size-3.5" />
                        <span>CPU</span>
                      </div>
                      <div class="stat-tile-body">
                        <div class="dashboard-ring size-16" :style="ringStyle(cpuPercent)">
                          <div class="dashboard-ring-inner">
                            <p>{{ formatPercent(cpuPercent) }}</p>
                          </div>
                        </div>
                      </div>
                      <p class="stat-tile-foot">{{ formatCores(cpuUsedCores) }} of {{ Math.round(cpuTotalCores) }} vCPU</p>
                    </div>
                  </div>
                </div>
              </section>

              <section v-else class="panel flex h-full flex-col overflow-hidden">
                <div class="widget-drag flex items-center gap-2 border-b border-surface px-3 py-2" :class="editing ? 'cursor-move select-none' : ''">
                  <UIcon name="i-lucide-list-checks" class="size-4 shrink-0 text-faint" />
                  <span class="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">Task distribution</span>
                </div>
                <div class="min-h-0 flex-1 overflow-auto p-3">
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="[state, count] in taskEntries"
                      :key="state"
                      type="button"
                      class="panel-flush flex items-center gap-2.5 px-3 py-2 transition"
                      :class="editing ? 'cursor-default opacity-70' : 'cursor-pointer hover:ring-1 hover:ring-beacon/40'"
                      :disabled="editing"
                      @click="openTaskStatus(state)"
                    >
                      <StatusBadge :state="state" />
                      <span class="font-mono text-sm font-semibold text-foam">{{ count }}</span>
                    </button>
                    <p v-if="!taskEntries.length" class="text-sm text-(--color-muted)">No tasks scheduled.</p>
                  </div>
                  <p class="mt-3 font-mono text-xs text-faint">
                    Docker {{ d?.swarm?.dockerVersion || '-' }} &middot; swarm {{ (d?.swarm?.id || '').slice(0, 12) || '-' }}
                  </p>
                </div>
              </section>
            </GridItem>
          </GridLayout>

          <template #fallback>
            <div class="panel p-10 text-center text-sm text-faint">Loading dashboard…</div>
          </template>
        </ClientOnly>
        </div>

        <div class="grid min-h-64 flex-1 auto-rows-fr grid-cols-1 gap-3 xl:grid-cols-2">
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
      </div>
    </DataState>

    <TaskStatusModal v-model:open="taskModalOpen" :state="activeTaskState" :tasks="modalTasks" :loading="modalLoading" />
  </div>
</template>

<style scoped>
/* Each stat gets its own bounded card so a ring and the number/label it
   belongs to are never ambiguous next to a neighboring stat. */
.stat-tile {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  border-radius: 0.75rem;
  background: var(--color-abyss);
  border: 1px solid var(--color-hull-soft);
  padding: 0.6rem 0.5rem;
  text-align: center;
}

.stat-tile-head {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--color-muted);
}

.stat-tile-body {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
}

.stat-tile-figure {
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1;
  color: var(--color-foam);
}

.stat-tile-figure-caption {
  margin-top: 0.15rem;
  font-size: 0.65rem;
  color: var(--color-muted);
}

.stat-tile-foot {
  font-size: 0.66rem;
  line-height: 1.1;
  color: var(--color-muted);
}

.dashboard-ring {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  padding: 0.3rem;
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
  font-family: var(--font-display);
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1;
  color: var(--color-foam);
}
</style>
