<script setup lang="ts">
// Zabbix host detail: availability, interfaces, linked templates, Latest data
// (items with real values) and Triggers — plus a real history graph for the
// selected item (from the server_item_history hypertable).
const route = useRoute()
const { hasApp } = useAuth()
const { bitrate } = useFormat()

const { data: host, refresh } = useAsyncData(`serverHost-${route.params.id}`, () => $fetch<any>(`/api/server/hosts/${route.params.id}`), { server: false })

onMounted(() => {
  const t = setInterval(refresh, 15000)
  onUnmounted(() => clearInterval(t))
})

// Selected item → history graph.
const selItem = ref<any>(null)
const range = ref('6h')
const rangeItems = [
  { value: '1h', label: '1h' }, { value: '6h', label: '6h' },
  { value: '24h', label: '24h' }, { value: '7d', label: '7d' }
]
const { data: hist } = useAsyncData('serverItemHist',
  () => selItem.value ? $fetch<any>(`/api/server/items/${selItem.value.id}/history?range=${range.value}`) : Promise.resolve(null),
  { watch: [selItem, range], server: false, default: () => null })

function fmtTime(t: string) {
  return range.value === '7d'
    ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
const chartLabels = computed(() => (hist.value?.points || []).map((p: any) => fmtTime(p.time)))
const chartDatasets = computed(() => [{ label: hist.value?.name || 'Value', data: (hist.value?.points || []).map((p: any) => p.avg), color: '#34d399' }])
const hasHistory = computed(() => (hist.value?.points || []).length > 0)

function fmtValue(item: any) {
  if (item.last_text != null) return item.last_text
  if (item.last_value == null) return '—'
  if (item.key_ === 'system.uptime' || item.key_ === 'net.if.uptime') {
    const s = Number(item.last_value); const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600)
    return `${d}d ${h}h`
  }
  if (item.key_ === 'net.if.in' || item.key_ === 'net.if.out') return bitrate(Number(item.last_value))
  if (item.key_ === 'net.if.status') return Number(item.last_value) === 1 ? 'Up' : 'Down'
  return `${Math.round(Number(item.last_value) * 100) / 100}${item.units ? ' ' + item.units : ''}`
}

function availMeta(a: string, paused: boolean) {
  if (paused) return { label: 'Paused', cls: 'text-slate-400' }
  if (a === 'available') return { label: 'Available', cls: 'text-green-500' }
  if (a === 'unavailable') return { label: 'Unavailable', cls: 'text-red-500' }
  return { label: 'Unknown', cls: 'text-faint' }
}
</script>

<template>
  <div>
    <NuxtLink to="/monitoring/server/hosts" class="mb-3 inline-flex items-center gap-1 text-sm text-(--color-muted) hover:text-foam transition">
      <UIcon name="i-lucide-arrow-left" class="size-4" /> Hosts
    </NuxtLink>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else-if="!host" class="panel p-10 text-center text-faint text-sm">Loading…</div>

    <div v-else class="space-y-6">
      <!-- Header -->
      <div class="panel p-5 flex flex-wrap items-center gap-x-10 gap-y-4">
        <div>
          <h1 class="font-display text-lg font-semibold text-foam">{{ host.name }}</h1>
          <p class="font-mono text-xs text-faint">{{ host.ip }}</p>
        </div>
        <div><span class="text-xs uppercase text-(--color-muted)">Availability</span>
          <p class="mt-1 text-sm font-medium" :class="availMeta(host.availability, host.monitoring_enabled === false).cls">{{ availMeta(host.availability, host.monitoring_enabled === false).label }}</p></div>
        <div><span class="text-xs uppercase text-(--color-muted)">OS</span><p class="mt-1 text-sm text-foam">{{ host.os || '—' }}</p></div>
        <div><span class="text-xs uppercase text-(--color-muted)">Uptime</span><p class="mt-1 text-sm text-foam">{{ host.uptime || '—' }}</p></div>
        <div><span class="text-xs uppercase text-(--color-muted)">Poll method</span><p class="mt-1 text-sm uppercase text-foam">{{ host.poll_method }}</p></div>
        <div class="flex flex-wrap gap-1">
          <UBadge v-for="g in host.groups" :key="g.id" color="neutral" variant="subtle" size="xs">{{ g.name }}</UBadge>
          <UBadge v-for="t in host.templates" :key="t.id" color="primary" variant="subtle" size="xs">{{ t.name }}</UBadge>
        </div>
      </div>

      <!-- Selected item graph -->
      <div v-if="selItem" class="panel p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-chart-line" class="size-4 text-beacon" />
            <h2 class="font-display text-sm font-semibold text-foam">{{ selItem.name }}</h2>
            <span class="text-xs text-faint">{{ selItem.key_ }}</span>
          </div>
          <div class="flex items-center gap-2">
            <USelect v-model="range" :items="rangeItems" value-key="value" label-key="label" size="xs" class="w-24" />
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" @click="selItem = null" />
          </div>
        </div>
        <div v-if="!hasHistory" class="flex h-56 items-center justify-center text-sm text-faint">No history yet — it fills in as the poller runs.</div>
        <MetricsChart v-else :labels="chartLabels" :datasets="chartDatasets" :height="260" :format-value="(n: number) => `${n}${hist?.units ? ' ' + hist.units : ''}`" :y-title="hist?.units || ''" />
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <!-- Latest data -->
        <div class="panel p-5">
          <h3 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-3">Latest data</h3>
          <table class="w-full text-left text-sm text-(--color-muted)">
            <thead class="text-xs uppercase text-faint"><tr><th class="py-2">Item</th><th>Last value</th><th></th></tr></thead>
            <tbody class="divide-y divide-surface">
              <tr v-for="i in host.items" :key="i.id" class="hover:bg-surface-2/40">
                <td class="py-2"><span class="text-foam">{{ i.name }}</span><div class="font-mono text-xs text-faint">{{ i.key_ }}</div></td>
                <td class="font-display font-semibold text-foam">{{ fmtValue(i) }}</td>
                <td class="text-right"><UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-chart-line" aria-label="Graph" @click="selItem = i" /></td>
              </tr>
              <tr v-if="!host.items.length"><td colspan="3" class="py-3 text-center text-faint">No items. Link a template to this host.</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Triggers -->
        <div class="panel p-5">
          <h3 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-3">Triggers</h3>
          <table class="w-full text-left text-sm text-(--color-muted)">
            <thead class="text-xs uppercase text-faint"><tr><th class="py-2">Name</th><th>Severity</th><th>State</th></tr></thead>
            <tbody class="divide-y divide-surface">
              <tr v-for="t in host.triggers" :key="t.id">
                <td class="py-2 text-foam">{{ t.name }}</td>
                <td><span class="px-2 py-0.5 rounded text-xs" :class="severityMeta(t.severity).badge">{{ severityMeta(t.severity).label }}</span></td>
                <td><span :class="t.last_state === 'problem' ? 'text-red-500' : 'text-green-500'">{{ t.last_state === 'problem' ? 'Problem' : 'OK' }}</span></td>
              </tr>
              <tr v-if="!host.triggers.length"><td colspan="3" class="py-3 text-center text-faint">No triggers.</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Interfaces -->
        <div class="panel p-5">
          <h3 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-3">Interfaces</h3>
          <table class="w-full text-left text-sm text-(--color-muted)">
            <thead class="text-xs uppercase text-faint"><tr><th class="py-2">Type</th><th>Address</th><th>Port</th></tr></thead>
            <tbody class="divide-y divide-surface">
              <tr v-for="f in host.interfaces" :key="f.id"><td class="py-2 uppercase text-foam">{{ f.type }}</td><td class="font-mono text-xs">{{ f.ip }}</td><td>{{ f.port }}</td></tr>
              <tr v-if="!host.interfaces.length"><td colspan="3" class="py-3 text-center text-faint">No interfaces.</td></tr>
            </tbody>
          </table>
        </div>

        <!-- System -->
        <div class="panel p-5">
          <h3 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-3">System</h3>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between border-b border-surface pb-1"><dt class="text-faint">SNMP name</dt><dd class="text-foam">{{ host.sys_name || '—' }}</dd></div>
            <div class="flex justify-between border-b border-surface pb-1"><dt class="text-faint">Last poll</dt><dd class="text-foam">{{ host.last_polled ? new Date(host.last_polled).toLocaleString() : '—' }}</dd></div>
            <div class="flex justify-between pb-1"><dt class="text-faint">Description</dt><dd class="text-foam truncate max-w-xs" :title="host.sys_descr">{{ host.sys_descr || host.description || '—' }}</dd></div>
          </dl>
        </div>
      </div>
    </div>
  </div>
</template>
