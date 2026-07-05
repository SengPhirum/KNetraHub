<script setup lang="ts">
// Zabbix "Latest data": every item's newest value across all hosts, searchable.
const { hasApp } = useAuth()
const { bitrate } = useFormat()

const { data: items, status, refresh } = useAsyncData('serverLatestData', () => $fetch<any[]>('/api/server/items'), { default: () => [], server: false })
onMounted(() => { const t = setInterval(refresh, 15000); onUnmounted(() => clearInterval(t)) })

const search = ref('')
const rows = computed(() => {
  const q = search.value.toLowerCase()
  return (items.value || []).filter((i: any) => !q || i.name.toLowerCase().includes(q) || i.key_.toLowerCase().includes(q) || i.host_name.toLowerCase().includes(q))
})

function fmtValue(i: any) {
  if (i.last_text != null) return i.last_text
  if (i.last_value == null) return '—'
  if (i.key_ === 'system.uptime' || i.key_ === 'net.if.uptime') { const s = Number(i.last_value); return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` }
  if (i.key_ === 'net.if.in' || i.key_ === 'net.if.out') return bitrate(Number(i.last_value))
  if (i.key_ === 'net.if.status') return Number(i.last_value) === 1 ? 'Up' : 'Down'
  return `${Math.round(Number(i.last_value) * 100) / 100}${i.units ? ' ' + i.units : ''}`
}
function age(clock: string | null) {
  if (!clock) return 'never'
  const s = Math.max(0, Math.round((Date.now() - Date.parse(clock)) / 1000))
  if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`; return `${Math.floor(s / 3600)}h`
}
</script>

<template>
  <div>
    <PageHeader title="Latest data" subtitle="Newest value collected for every item" icon="i-lucide-list" />

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="space-y-4">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Search item, key or host…" class="w-full sm:w-80" />
      <div class="panel">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-(--color-muted)">
            <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
              <tr><th class="px-4 py-3 font-medium">Host</th><th class="px-4 py-3 font-medium">Item</th><th class="px-4 py-3 font-medium">Key</th><th class="px-4 py-3 font-medium">Last value</th><th class="px-4 py-3 font-medium">Age</th><th class="px-4 py-3 font-medium"></th></tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-if="status === 'pending' && !items.length"><td colspan="6" class="px-4 py-8 text-center text-faint">Loading…</td></tr>
              <tr v-else-if="!rows.length"><td colspan="6" class="px-4 py-8 text-center text-faint">No items yet.</td></tr>
              <tr v-for="i in rows" :key="i.id" class="hover:bg-surface-2/50 transition">
                <td class="px-4 py-3"><NuxtLink :to="`/monitoring/server/hosts/${i.host_id}`" class="text-foam hover:text-beacon">{{ i.host_name }}</NuxtLink></td>
                <td class="px-4 py-3 text-foam">{{ i.name }}</td>
                <td class="px-4 py-3 font-mono text-xs">{{ i.key_ }}</td>
                <td class="px-4 py-3 font-display font-semibold text-foam">{{ fmtValue(i) }}</td>
                <td class="px-4 py-3 text-xs">{{ age(i.last_clock) }}</td>
                <td class="px-4 py-3 text-right"><UButton :to="`/monitoring/server/hosts/${i.host_id}`" size="xs" variant="ghost" color="neutral" icon="i-lucide-chart-line" aria-label="Graph" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
