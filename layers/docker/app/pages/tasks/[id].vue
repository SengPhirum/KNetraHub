<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string
const { bytes, cpus, relative, short } = useFormat()

const { data, status, error, refresh } = await useFetch<any>(`/api/tasks/${id}`, { lazy: true })

const currentUsage = computed(() => data.value?.currentUsage || { available: false })
const resources = computed(() => data.value?.resources || {})

const range = ref<'1h' | '6h' | '24h' | '7d'>('1h')
const { data: metricsData, refresh: refreshMetrics } = await useFetch<any>(`/api/tasks/${id}/metrics`, {
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
const historyLabels = computed(() => cpuSeries.value.map((p: any) => timeLabel(p.time)))
const hasMetrics = computed(() => cpuSeries.value.length > 0)

const { usageRingStyle } = useUsageRing()

function memoryPercent(used?: number | null, limit?: number | null) {
  if (!used || !limit) return null
  return Math.min(100, (used / limit) * 100)
}

function percentLabel(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '-'
  return `${value.toFixed(value < 10 ? 1 : 0)}%`
}

const cpuAllocatedNano = computed(() => resources.value.limitNanoCpus || resources.value.reservedNanoCpus || 0)
const memoryAllocatedBytes = computed(() => resources.value.limitMemoryBytes || resources.value.reservedMemoryBytes || currentUsage.value.memoryLimitBytes || 0)

function cpuRingPercent() {
  if (!currentUsage.value.available) return 0
  const allocatedCores = cpuAllocatedNano.value / 1e9
  if (allocatedCores > 0) return (Number(currentUsage.value.cpuPercent || 0) / (allocatedCores * 100)) * 100
  return Number(currentUsage.value.cpuPercent || 0)
}

function memoryRingPercent() {
  if (!currentUsage.value.available) return 0
  return memoryPercent(currentUsage.value.memoryUsedBytes, memoryAllocatedBytes.value) ?? 0
}

function cpuDetail() {
  const allocated = cpuAllocatedNano.value ? cpus(cpuAllocatedNano.value / 1e9) : 'No CPU reservation or limit'
  if (!currentUsage.value.available) return `${allocated}. Waiting for current usage samples.`
  return `${percentLabel(currentUsage.value.cpuPercent)} CPU now (${cpus(Number(currentUsage.value.cpuPercent || 0) / 100)}), allocated ${allocated}.`
}

function memoryDetail() {
  const allocated = memoryAllocatedBytes.value ? bytes(memoryAllocatedBytes.value) : 'No memory reservation or limit'
  if (!currentUsage.value.available) return `${allocated}. Waiting for current usage samples.`
  return `${bytes(currentUsage.value.memoryUsedBytes)} used / ${allocated} (${percentLabel(memoryRingPercent())}).`
}

const logsOpen = ref(false)
const logs = ref('')
const logsLoading = ref(false)
const tail = ref(200)
async function loadLogs() {
  logsLoading.value = true
  try {
    const res: any = await $fetch(`/api/tasks/${id}/logs`, { query: { tail: tail.value } })
    logs.value = res.logs || ''
  } catch (e: any) {
    logs.value = `Failed to load logs: ${e?.data?.statusMessage || e?.message}`
  } finally {
    logsLoading.value = false
  }
}
function viewLogs() {
  logsOpen.value = true
  if (!logs.value) loadLogs()
}
</script>

<template>
  <div>
    <DataState :status="status" :error="error">
      <PageHeader :title="`Task ${data?.serviceName || short(id)}${data?.slot != null ? '.' + data.slot : ''}`" subtitle="Task instance detail" icon="i-lucide-list-checks">
        <template #actions>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/tasks" label="Back" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
        </template>
      </PageHeader>

      <div class="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)]">
        <section class="panel p-4">
          <StatusBadge :state="data?.state" />

          <div class="mt-6 grid grid-cols-2 gap-3 text-center">
            <div>
              <div class="summary-ring-wrap" :title="cpuDetail()">
                <div class="summary-ring mx-auto size-24" :style="usageRingStyle(cpuRingPercent())" tabindex="0" :aria-label="cpuDetail()">
                  <div class="summary-ring-inner">
                    <p class="font-mono text-sm font-semibold text-foam">{{ cpuAllocatedNano ? cpus(cpuAllocatedNano / 1e9) : '—' }}</p>
                    <p class="text-[10px] leading-tight text-faint">vCPU</p>
                  </div>
                </div>
                <span class="summary-ring-tip">{{ cpuDetail() }}</span>
              </div>
            </div>
            <div>
              <div class="summary-ring-wrap" :title="memoryDetail()">
                <div class="summary-ring mx-auto size-24" :style="usageRingStyle(memoryRingPercent())" tabindex="0" :aria-label="memoryDetail()">
                  <div class="summary-ring-inner">
                    <p class="font-mono text-xs font-semibold text-foam">{{ memoryAllocatedBytes ? bytes(memoryAllocatedBytes) : '—' }}</p>
                    <p class="text-[10px] leading-tight text-faint">ram</p>
                  </div>
                </div>
                <span class="summary-ring-tip">{{ memoryDetail() }}</span>
              </div>
            </div>
          </div>

          <dl class="mt-6 divide-y divide-hull text-sm">
            <div class="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">ID</dt><dd class="truncate font-mono text-(--color-muted)" :title="data?.id">{{ short(data?.id, 16) || '-' }}</dd></div>
            <div class="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Image</dt><dd class="truncate font-mono text-foam" :title="data?.image">{{ data?.image || '-' }}</dd></div>
            <div class="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Image digest</dt><dd class="truncate font-mono text-xs text-(--color-muted)" :title="data?.imageDigest">{{ data?.imageDigest || '-' }}</dd></div>
            <div class="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Created</dt><dd class="text-foam">{{ relative(data?.createdAt) }}</dd></div>
            <div class="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2"><dt class="text-faint">Last update</dt><dd class="text-foam">{{ relative(data?.updatedAt) }}</dd></div>
          </dl>

          <div class="mt-4 flex flex-wrap gap-2 border-t border-hull pt-3">
            <UButton size="xs" color="primary" variant="ghost" icon="i-lucide-box" label="See service" :to="`/services/${data?.serviceId}`" />
            <UButton size="xs" color="primary" variant="ghost" icon="i-lucide-server" label="See node" :to="`/nodes/${data?.nodeId}`" />
            <UButton size="xs" color="primary" variant="ghost" icon="i-lucide-scroll-text" label="View log" @click="viewLogs" />
          </div>
        </section>

        <div class="space-y-4 min-w-0">
          <section class="panel p-4">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 class="font-display text-lg font-semibold text-foam">CPU usage</h2>
              <USelect v-model="range" :items="['1h', '6h', '24h', '7d']" size="xs" class="w-24" />
            </div>
            <ClientOnly>
              <div v-if="!hasMetrics" class="rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">
                No usage history for this range.
              </div>
              <MetricsChart
                v-else
                :labels="historyLabels"
                :datasets="[{ label: 'CPU', data: cpuSeries.map((p: any) => p.percent) }]"
                :format-value="(n) => `${n.toFixed(1)}%`"
                :height="200"
              />
            </ClientOnly>
          </section>

          <section class="panel p-4">
            <h2 class="mb-3 font-display text-lg font-semibold text-foam">Memory usage</h2>
            <ClientOnly>
              <div v-if="!hasMetrics" class="rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">
                No usage history for this range.
              </div>
              <MetricsChart
                v-else
                :labels="historyLabels"
                :datasets="[{ label: 'Used', data: memorySeries.map((p: any) => p.used) }]"
                :format-value="bytes"
                :height="200"
              />
            </ClientOnly>
          </section>

          <section v-if="logsOpen" class="panel p-0 overflow-hidden">
            <div class="flex items-center justify-between gap-2 border-b border-hull px-4 py-2.5">
              <span class="flex items-center gap-2 text-xs text-(--color-muted)"><UIcon name="i-lucide-scroll-text" class="size-4" /> Last {{ tail }} lines</span>
              <div class="flex gap-2">
                <USelect v-model="tail" :items="[100, 200, 500, 1000]" size="xs" @update:model-value="loadLogs" />
                <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-refresh-cw" :loading="logsLoading" @click="loadLogs" />
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="logsOpen = false" />
              </div>
            </div>
            <div v-if="logsLoading && !logs" class="flex items-center justify-center py-16 text-(--color-muted)">
              <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mr-2" /> Streaming...
            </div>
            <pre v-else class="logstream max-h-[60vh] overflow-auto px-4 py-3 text-xs whitespace-pre-wrap">{{ logs || 'No log output.' }}</pre>
          </section>
        </div>
      </div>
    </DataState>
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
  transition: filter 0.16s ease, transform 0.16s ease;
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
