<script setup lang="ts">
// Zabbix-style status map: a live grid of host nodes coloured by availability,
// grouped by host group, with open-problem counts. (Auto-generated from the
// current fleet; a custom drag-canvas editor can build on server_maps later.)
const { hasApp } = useAuth()

const { data: hosts, refresh } = useAsyncData('serverMapHosts', () => $fetch<any[]>('/api/server/hosts'), { default: () => [], server: false })
onMounted(() => { const t = setInterval(refresh, 15000); onUnmounted(() => clearInterval(t)) })

// Group hosts by their first group (or "Ungrouped").
const grouped = computed(() => {
  const map = new Map<string, any[]>()
  for (const h of hosts.value || []) {
    const key = h.groups?.[0]?.name || 'Ungrouped'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(h)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
})

function nodeClass(h: any) {
  if (h.monitoring_enabled === false) return 'border-slate-500/40 bg-slate-500/5'
  if (h.problem_count > 0 || h.availability === 'unavailable') return 'border-red-500/50 bg-red-500/10'
  if (h.availability === 'available') return 'border-green-500/40 bg-green-500/5'
  return 'border-hull bg-surface-2'
}
function dotClass(h: any) {
  if (h.monitoring_enabled === false) return 'bg-slate-500'
  if (h.availability === 'available') return 'bg-green-500'
  if (h.availability === 'unavailable') return 'bg-red-500'
  return 'bg-slate-400'
}
</script>

<template>
  <div>
    <PageHeader title="Maps" subtitle="Live host status map" icon="i-lucide-map" />

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else-if="!hosts.length" class="panel p-10 text-center text-faint text-sm">No hosts to map yet.</div>

    <div v-else class="space-y-6">
      <section v-for="[group, list] in grouped" :key="group" class="panel p-5">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-4">{{ group }}</h2>
        <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <NuxtLink v-for="h in list" :key="h.id" :to="`/monitoring/server/hosts/${h.id}`"
                    class="rounded-lg border p-3 transition hover:ring-1 hover:ring-beacon/30" :class="nodeClass(h)">
            <div class="flex items-center gap-2">
              <span class="size-2.5 rounded-full shrink-0" :class="dotClass(h)"></span>
              <span class="font-medium text-foam truncate">{{ h.name }}</span>
            </div>
            <div class="mt-1 font-mono text-xs text-faint truncate">{{ h.ip }}</div>
            <div v-if="h.problem_count > 0" class="mt-2"><UBadge color="error" variant="subtle" size="xs">{{ h.problem_count }} problem(s)</UBadge></div>
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
