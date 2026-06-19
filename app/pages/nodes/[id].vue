<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string
const { can } = useAuth()
const { bytes, cpus, relative, short } = useFormat()
const toast = useToast()

const { data, status, error, refresh } = await useFetch(`/api/nodes/${id}`, { lazy: true })

const node = computed(() => data.value?.node)

// resource history
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
const taskRows = computed(() => data.value?.tasks || [])
const taskSortOptions = [
  { label: 'Image', value: 'Spec.ContainerSpec.Image' },
  { label: 'State', value: 'Status.State' },
  { label: 'Updated', value: 'Status.Timestamp' },
  { label: 'Task ID', value: 'ID' }
]
const { items: filteredTasks, search, sortBy, sortDir, sortOptions } = useListControls(`node:${id}:tasks`, taskRows, {
  sortOptions: taskSortOptions,
  defaultSortBy: 'Status.Timestamp',
  defaultSortDir: 'desc'
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
</script>

<template>
  <div>
    <DataState :status="status" :error="error">
      <PageHeader :title="hostname || short(id)" :subtitle="node?.Spec?.Role" icon="i-lucide-server">
        <template #actions>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/nodes" label="Back" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
          <template v-if="can('operator')">
            <UButton icon="i-lucide-tags" color="neutral" variant="soft" label="Labels" @click="openLabels" />
          </template>
          <UButton v-if="can('admin')" icon="i-lucide-trash-2" color="error" variant="soft" label="Remove" @click="remove" />
        </template>
      </PageHeader>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <StatCard label="Status" :value="node?.Status?.State || '—'" icon="i-lucide-activity" />
        <StatCard label="Availability" :value="node?.Spec?.Availability || '—'" icon="i-lucide-toggle-right" />
        <StatCard label="CPUs" :value="cpus((desc?.Resources?.NanoCPUs || 0) / 1e9)" icon="i-lucide-cpu" />
        <StatCard label="Memory" :value="bytes(desc?.Resources?.MemoryBytes)" icon="i-lucide-memory-stick" />
      </div>

      <div class="grid gap-4 lg:grid-cols-2 mb-5">
        <div class="panel p-4">
          <h3 class="font-display text-sm font-semibold text-foam mb-3">Engine</h3>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-faint">Address</dt><dd class="font-mono text-(--color-muted)">{{ node?.Status?.Addr || '—' }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-faint">Engine</dt><dd class="font-mono text-(--color-muted)">{{ desc?.Engine?.EngineVersion || '—' }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-faint">Platform</dt><dd class="font-mono text-(--color-muted)">{{ desc?.Platform?.OS }}/{{ desc?.Platform?.Architecture }}</dd></div>
            <div v-if="node?.ManagerStatus" class="flex justify-between gap-3"><dt class="text-faint">Reachability</dt><dd class="font-mono text-(--color-muted)">{{ node.ManagerStatus.Reachability }}</dd></div>
          </dl>
        </div>
        <div class="panel p-4">
          <h3 class="font-display text-sm font-semibold text-foam mb-3">Labels</h3>
          <div v-if="Object.keys(labels).length" class="flex flex-wrap gap-2">
            <span v-for="(v, k) in labels" :key="k" class="font-mono text-xs rounded bg-surface-2 px-2 py-1 text-(--color-muted)">{{ k }}=<span class="text-foam">{{ v }}</span></span>
          </div>
          <p v-else class="text-sm text-faint">No labels set.</p>
        </div>
      </div>

      <div class="panel p-4 mb-5">
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
      </div>

      <h3 class="font-display text-sm font-semibold text-foam mb-3">Tasks on this node</h3>
      <ListControls
        v-model:search="search"
        v-model:sort-by="sortBy"
        v-model:sort-dir="sortDir"
        :sort-options="sortOptions"
        placeholder="Search node tasks"
      />
      <div v-if="!filteredTasks.length" class="panel p-8 text-center text-sm text-(--color-muted)">No tasks scheduled here.</div>
      <div v-else class="space-y-2">
        <div v-for="t in filteredTasks" :key="t.ID" class="panel-flush p-3 flex items-center justify-between gap-3 text-sm">
          <div class="min-w-0">
            <p class="truncate font-mono text-xs text-(--color-muted)">{{ (t.Spec?.ContainerSpec?.Image || '').split('@')[0] }}</p>
          </div>
          <div class="flex items-center gap-4 shrink-0">
            <StatusBadge :state="t.Status?.State" />
            <span class="text-xs text-faint">{{ relative(t.Status?.Timestamp) }}</span>
          </div>
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
