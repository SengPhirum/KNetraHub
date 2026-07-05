<script setup lang="ts">
type NodeViewMode = 'cards' | 'list'
type NodeUsage = {
  id: string
  available: boolean
  sampledAt: string
  error?: string
  cpu: { cores: number; percent: number }
  memory: { usedBytes: number; totalBytes: number; percent: number }
  disk: {
    usedBytes: number
    totalBytes?: number
    availableBytes?: number
    percent?: number
    dockerUsedBytes?: number
    path?: string
  }
  containers: { running: number; sampled: number }
}
type NodeUsageMetric = {
  key: 'cpu' | 'memory' | 'disk'
  label: string
  icon: string
  value: string
  hint: string
  percent?: number
  available: boolean
}
type NodeSpecItem = {
  key: string
  label: string
  icon: string
  value: string
  title: string
}

const { can } = useAuth()
const { bytes, cpus, short } = useFormat()
const { prefs } = usePreferences()
const toast = useToast()

const viewMode = useLocalStorage<NodeViewMode>('knetrahub:nodes:view', 'cards')

const { data, status, error, refreshing, refresh } = useApiCache('nodes', () => $fetch<any[]>('/api/nodes'))
const usageData = useState<{ sampledAt: string; nodes: NodeUsage[] } | null>('nodes:usage', () => null)
const usageRefreshing = ref(false)

onMounted(() => {
  refresh()
  refreshUsage()
})

const nodes = computed(() => data.value ?? [])
const usageById = computed(() => new Map((usageData.value?.nodes || []).map((usage) => [usage.id, usage])))
const nodesForList = computed(() => nodes.value.map((node: any) => ({ ...node, usage: nodeUsage(node) })))

const viewOptions: Array<{ value: NodeViewMode; icon: string; label: string }> = [
  { value: 'cards', icon: 'i-lucide-layout-grid', label: 'Cards' },
  { value: 'list', icon: 'i-lucide-list', label: 'List' }
]
const nodeSortOptions = [
  { label: 'Hostname', value: 'hostname' },
  { label: 'State', value: 'state' },
  { label: 'Role', value: 'role' },
  { label: 'Availability', value: 'availability' },
  { label: 'CPU', value: 'cpus' },
  { label: 'Memory', value: 'memory' },
  { label: 'Disk usage', value: 'usage.disk.percent' },
  { label: 'Disk total', value: 'usage.disk.totalBytes' }
]
const nodeFilterOptions = [
  { key: 'state', label: 'State', getValue: (n: any) => n.state },
  { key: 'role', label: 'Role', getValue: (n: any) => n.role },
  { key: 'availability', label: 'Availability', getValue: (n: any) => n.availability }
]
const { items: filteredNodes, search, sortBy, sortDir, sortOptions, filters, facets } = useListControls('nodes', nodesForList, {
  sortOptions: nodeSortOptions,
  defaultSortBy: 'hostname',
  filterOptions: nodeFilterOptions
})

const { connected } = useDockerEvents((evt) => {
  if (evt.type === 'node') {
    refresh()
    refreshUsage()
  }
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) {
    refresh()
    refreshUsage()
  }
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })
useIntervalFn(refreshUsage, 5000, { immediate: false })

async function refreshAll() {
  await Promise.all([refresh(), refreshUsage()])
}

async function refreshUsage() {
  if (usageRefreshing.value) return
  usageRefreshing.value = true
  try {
    usageData.value = await $fetch('/api/nodes/usage')
  } catch {
    // Keep the last good sample on screen; the base node list still owns visible errors.
  } finally {
    usageRefreshing.value = false
  }
}

async function patch(node: any, body: any, label: string) {
  const saved = [...(data.value ?? [])]
  const idx = saved.findIndex((n) => n.id === node.id)
  if (idx !== -1) data.value = saved.map((n, i) => i === idx ? { ...n, ...body } : n)
  try {
    await $fetch(`/api/nodes/${node.id}`, { method: 'PATCH', body })
    toast.add({ title: `${node.hostname}: ${label}`, color: 'primary', icon: 'i-lucide-server' })
    refresh()
  } catch (e: any) {
    data.value = saved
    toast.add({ title: 'Action failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

function menu(n: any) {
  const items: any[] = [[{ label: 'Inspect', icon: 'i-lucide-eye', to: `/nodes/${n.id}` }]]
  if (can('operator')) {
    const avail: any[] = []
    if (n.availability !== 'active') avail.push({ label: 'Activate', icon: 'i-lucide-play', onSelect: () => patch(n, { availability: 'active' }, 'activated') })
    if (n.availability !== 'pause') avail.push({ label: 'Pause', icon: 'i-lucide-pause', onSelect: () => patch(n, { availability: 'pause' }, 'paused') })
    if (n.availability !== 'drain') avail.push({ label: 'Drain', icon: 'i-lucide-download', onSelect: () => patch(n, { availability: 'drain' }, 'draining') })
    items.push(avail)
    items.push([
      n.role === 'worker'
        ? { label: 'Promote to manager', icon: 'i-lucide-arrow-up', onSelect: () => patch(n, { role: 'manager' }, 'promoted') }
        : { label: 'Demote to worker', icon: 'i-lucide-arrow-down', onSelect: () => patch(n, { role: 'worker' }, 'demoted') }
    ])
  }
  return items
}

function engineVersion(n: any) {
  return n.engine ? `docker ${n.engine}` : 'docker -'
}

function platformLabel(n: any) {
  return n.platform || '-'
}

function labelEntries(n: any) {
  return Object.entries(n.labels || {}) as Array<[string, string]>
}

function labelSummary(n: any) {
  const entries = labelEntries(n)
  if (!entries.length) return '-'
  const shown = entries.slice(0, 2).map(([k, v]) => `${k}=${v}`).join(', ')
  return entries.length > 2 ? `${shown}, +${entries.length - 2}` : shown
}

function percentLabel(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return '-'
  return `${Math.round(value)}%`
}

function nodeUsage(n: any) {
  return usageById.value.get(n.id)
}

function safeMetricPercent(percent: number | undefined, available: boolean) {
  if (!available || percent == null || !Number.isFinite(percent)) return 0
  return Math.max(0, Math.min(100, Math.round(percent)))
}

function metricColor(percent: number | undefined, available: boolean) {
  if (!available || percent == null || !Number.isFinite(percent)) return 'var(--color-idle)'
  if (percent >= 90) return 'var(--color-down)'
  if (percent >= 75) return 'var(--color-pending)'
  return 'var(--color-running)'
}

function metricBarStyle(percent: number | undefined, available: boolean) {
  const safePercent = safeMetricPercent(percent, available)
  return {
    width: `${safePercent}%`,
    background: metricColor(percent, available)
  }
}

function nodeDiskTotal(n: any) {
  const usage = nodeUsage(n)
  return usage?.available && usage.disk.totalBytes ? bytes(usage.disk.totalBytes) : '-'
}

function nodeSpecs(n: any): NodeSpecItem[] {
  const usage = nodeUsage(n)
  const disk = usage?.disk
  const diskTitle = usage?.available && disk?.totalBytes
    ? `${bytes(disk.usedBytes)} used / ${bytes(disk.totalBytes)} allocated${disk.path ? ` at ${disk.path}` : ''}`
    : usage?.error || 'Disk allocation waits for node metrics'

  return [
    {
      key: 'cpu',
      label: 'CPU',
      icon: 'i-lucide-cpu',
      value: cpus(n.cpus),
      title: `${cpus(n.cpus)} allocated`
    },
    {
      key: 'memory',
      label: 'RAM',
      icon: 'i-lucide-memory-stick',
      value: bytes(n.memory),
      title: `${bytes(n.memory)} allocated`
    },
    {
      key: 'disk',
      label: 'Disk',
      icon: 'i-lucide-hard-drive',
      value: nodeDiskTotal(n),
      title: diskTitle
    },
    {
      key: 'engine',
      label: 'Docker',
      icon: 'i-lucide-box',
      value: n.engine || '-',
      title: `${engineVersion(n)} on ${platformLabel(n)}`
    }
  ]
}

function usageMetrics(n: any): NodeUsageMetric[] {
  const usage = nodeUsage(n)
  const available = !!usage?.available
  const diskHasPercent = usage?.disk.percent != null
  const diskUsedText = usage?.disk.usedBytes != null ? bytes(usage.disk.usedBytes) : '0 B'
  const diskDockerText = usage?.disk.dockerUsedBytes != null ? ` | Docker ${bytes(usage.disk.dockerUsedBytes)}` : ''

  return [
    {
      key: 'cpu',
      label: 'CPU',
      icon: 'i-lucide-cpu',
      value: available ? percentLabel(usage?.cpu.percent) : '-',
      hint: available ? `${Number(usage?.cpu.cores || 0).toFixed(1)} used / ${cpus(n.cpus)}` : usage?.error || 'Metrics unavailable',
      percent: usage?.cpu.percent,
      available
    },
    {
      key: 'memory',
      label: 'RAM',
      icon: 'i-lucide-memory-stick',
      value: available ? percentLabel(usage?.memory.percent) : '-',
      hint: available ? `${bytes(usage?.memory.usedBytes || 0)} / ${bytes(usage?.memory.totalBytes || n.memory || 0)}` : usage?.error || 'Metrics unavailable',
      percent: usage?.memory.percent,
      available
    },
    {
      key: 'disk',
      label: 'Disk',
      icon: 'i-lucide-hard-drive',
      value: available ? (diskHasPercent ? percentLabel(usage?.disk.percent) : diskUsedText) : '-',
      hint: available
        ? diskHasPercent
          ? `${diskUsedText} / ${bytes(usage?.disk.totalBytes || 0)}${diskDockerText}`
          : `${diskUsedText} Docker data`
        : usage?.error || 'Metrics unavailable',
      percent: usage?.disk.percent,
      available
    }
  ]
}

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

function nodeBadges(n: any) {
  const badges = [
    n.state || 'unknown',
    ...(n.leader ? ['leader'] : []),
    n.role || 'unknown',
    n.availability || 'unknown'
  ]
  return badges.map((label) => ({
    label: String(label).toUpperCase(),
    class: badgeClass(String(label))
  }))
}
</script>

<template>
  <div>
    <PageHeader title="Nodes" subtitle="Managers and workers in the swarm fleet" icon="i-lucide-server">
      <template #actions>
        <ListControls
          inline
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          v-model:filters="filters"
          :sort-options="sortOptions"
          :facets="facets"
          placeholder="Search nodes"
        />
        <div class="flex rounded-md border border-hull bg-surface p-0.5" aria-label="Node view">
          <button
            v-for="opt in viewOptions"
            :key="opt.value"
            type="button"
            class="flex size-8 items-center justify-center rounded text-(--color-muted) transition hover:text-foam"
            :class="viewMode === opt.value ? 'bg-beacon/15 text-beacon ring-1 ring-inset ring-beacon/25' : ''"
            :title="opt.label"
            :aria-label="`${opt.label} view`"
            :aria-pressed="viewMode === opt.value"
            @click="viewMode = opt.value"
          >
            <UIcon :name="opt.icon" class="size-4" />
          </button>
        </div>
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing || usageRefreshing" @click="refreshAll()" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!filteredNodes.length" :refreshing="refreshing" empty-label="No nodes found." empty-icon="i-lucide-server">
      <TransitionGroup
        v-if="viewMode === 'cards'"
        name="list"
        tag="div"
        class="grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
      >
        <article
          v-for="n in filteredNodes"
          :key="n.id"
          class="panel-flush rounded-lg p-4 transition hover:ring-1 hover:ring-beacon/30"
        >
          <div class="flex items-start justify-between gap-3">
            <NuxtLink :to="`/nodes/${n.id}`" class="group flex min-w-0 items-start gap-3">
              <span
                class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-2 text-(--color-muted) ring-1 ring-hull"
                :class="n.leader ? 'sonar text-beacon ring-beacon/35' : ''"
              >
                <UIcon :name="n.leader ? 'i-lucide-anchor' : 'i-lucide-server'" class="size-5" />
              </span>
              <span class="min-w-0">
                <span class="block truncate font-display text-base font-semibold text-foam group-hover:text-beacon">{{ n.hostname || '-' }}</span>
                <span class="mt-0.5 block truncate font-mono text-xs text-faint" :title="`${engineVersion(n)} on ${platformLabel(n)}`">
                  {{ n.addr || '-' }} <span class="text-(--color-muted)">·</span> {{ engineVersion(n) }}
                </span>
              </span>
            </NuxtLink>
            <UDropdownMenu :items="menu(n)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Actions" />
            </UDropdownMenu>
          </div>

          <div class="mt-3 flex flex-wrap gap-1.5">
            <span
              v-for="badge in nodeBadges(n)"
              :key="badge.label"
              class="rounded px-2 py-1 text-[11px] font-semibold leading-none ring-1"
              :class="badge.class"
            >
              {{ badge.label }}
            </span>
          </div>

          <div class="mt-4 grid gap-2 sm:grid-cols-3">
            <div
              v-for="metric in usageMetrics(n)"
              :key="metric.key"
              class="node-usage-card min-w-0 rounded-md bg-surface/70 p-2.5 ring-1 ring-hull-soft"
              :title="metric.hint"
            >
              <div class="flex min-w-0 items-center justify-between gap-2">
                <span class="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase text-faint">
                  <UIcon :name="metric.icon" class="size-3.5 shrink-0" />
                  <span class="truncate">{{ metric.label }}</span>
                </span>
                <span class="shrink-0 font-mono text-xs font-semibold text-foam">{{ metric.value }}</span>
              </div>
              <div class="node-bar mt-2">
                <span class="node-bar-fill" :style="metricBarStyle(metric.percent, metric.available)" />
              </div>
              <p class="mt-1.5 truncate font-mono text-[11px] text-(--color-muted)">{{ metric.hint }}</p>
            </div>
          </div>
        </article>
      </TransitionGroup>

      <div v-else class="space-y-2">
        <div class="hidden rounded-md px-3.5 text-[11px] font-semibold uppercase tracking-wide text-faint xl:grid xl:grid-cols-[minmax(12rem,1.2fr)_minmax(10rem,0.95fr)_minmax(12rem,1.1fr)_minmax(15rem,1.35fr)_minmax(9rem,0.8fr)_auto] xl:items-center xl:gap-4">
          <span>Node</span>
          <span>Status</span>
          <span>Specs</span>
          <span>Usage</span>
          <span>Labels</span>
          <span class="text-right">Actions</span>
        </div>
        <TransitionGroup name="list" tag="div" class="space-y-2">
          <div
            v-for="n in filteredNodes"
            :key="n.id"
            class="panel-flush grid gap-3 rounded-lg p-3.5 transition hover:ring-1 hover:ring-beacon/30 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1.2fr)_minmax(10rem,0.95fr)_minmax(12rem,1.1fr)_minmax(15rem,1.35fr)_minmax(9rem,0.8fr)_auto] xl:items-center xl:gap-4"
          >
            <div class="min-w-0 sm:col-span-2 xl:col-span-1">
              <NuxtLink :to="`/nodes/${n.id}`" class="group flex items-center gap-2">
                <span v-if="n.leader" class="sonar text-beacon"><UIcon name="i-lucide-anchor" class="size-4" /></span>
                <span v-else class="dot" :class="n.state === 'ready' ? 'dot-running' : 'dot-down'" />
                <span class="truncate font-medium text-foam group-hover:text-beacon">{{ n.hostname || '-' }}</span>
              </NuxtLink>
              <p class="mt-1 truncate pl-6 font-mono text-xs text-faint">{{ n.addr || '-' }} | {{ engineVersion(n) }} | {{ platformLabel(n) }}</p>
            </div>

            <div class="flex min-w-0 flex-wrap gap-1.5">
              <span
                v-for="badge in nodeBadges(n)"
                :key="badge.label"
                class="rounded px-2 py-1 text-[11px] font-semibold leading-none ring-1"
                :class="badge.class"
              >
                {{ badge.label }}
              </span>
            </div>

            <div class="grid min-w-0 grid-cols-3 gap-1.5">
              <div
                v-for="spec in nodeSpecs(n).slice(0, 3)"
                :key="spec.key"
                class="min-w-0 rounded bg-surface/60 px-2 py-1.5 ring-1 ring-hull-soft"
                :title="spec.title"
              >
                <p class="truncate text-[10px] font-semibold uppercase text-faint">{{ spec.label }}</p>
                <p class="truncate font-mono text-xs text-foam">{{ spec.value }}</p>
              </div>
            </div>

            <div class="grid min-w-0 grid-cols-3 gap-1.5">
              <div
                v-for="metric in usageMetrics(n)"
                :key="metric.key"
                class="min-w-0 rounded bg-surface/70 px-2 py-1.5 ring-1 ring-hull-soft"
                :title="metric.hint"
              >
                <div class="flex min-w-0 items-center justify-between gap-1">
                  <p class="truncate text-[10px] font-semibold uppercase text-faint">{{ metric.label }}</p>
                  <p class="shrink-0 font-mono text-[11px] text-foam">{{ metric.value }}</p>
                </div>
                <div class="node-bar node-bar-sm mt-1.5">
                  <span class="node-bar-fill" :style="metricBarStyle(metric.percent, metric.available)" />
                </div>
              </div>
            </div>

            <div class="min-w-0 font-mono text-xs text-(--color-muted)" :title="labelSummary(n)">
              <span class="block truncate">{{ labelSummary(n) }}</span>
            </div>

            <div class="flex justify-end sm:col-span-2 xl:col-span-1">
              <UDropdownMenu :items="menu(n)" :content="{ align: 'end' }">
                <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="sm" aria-label="Actions" />
              </UDropdownMenu>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </DataState>
  </div>
</template>

<style scoped>
.node-usage-card {
  min-height: 5rem;
}

.node-bar {
  position: relative;
  height: 0.45rem;
  overflow: hidden;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--color-hull) 82%, transparent);
}

.node-bar-sm {
  height: 0.32rem;
}

.node-bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 0.25s ease, background-color 0.25s ease;
}
</style>
