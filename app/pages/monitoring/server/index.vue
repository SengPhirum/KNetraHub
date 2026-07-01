<script setup lang="ts">
// Server (Zabbix) dashboard: availability, problems-by-severity, and the
// current top problems, all from the real poller.
const { hasApp } = useAuth()

const { data: hosts, refresh: rH } = useAsyncData('serverDashHosts', () => $fetch<any[]>('/api/server/hosts'), { default: () => [], server: false })
const { data: problems, refresh: rP } = useAsyncData('serverDashProblems', () => $fetch<any[]>('/api/server/problems'), { default: () => [], server: false })
onMounted(() => { const t = setInterval(() => { rH(); rP() }, 15000); onUnmounted(() => clearInterval(t)) })

const avail = computed(() => {
  const list = hosts.value || []
  return {
    total: list.length,
    available: list.filter((h) => h.availability === 'available').length,
    unavailable: list.filter((h) => h.availability === 'unavailable').length,
    paused: list.filter((h) => h.monitoring_enabled === false).length
  }
})

const openProblems = computed(() => (problems.value || []).filter((p: any) => p.status === 'problem'))
const bySeverity = computed(() => {
  const counts = new Map<number, number>()
  for (const p of openProblems.value) counts.set(Number(p.severity_num), (counts.get(Number(p.severity_num)) || 0) + 1)
  return SEVERITIES.slice().reverse().map((s) => ({ ...s, count: counts.get(s.value) || 0 }))
})
const topProblems = computed(() => openProblems.value.slice(0, 8))

function duration(p: any) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(p.fired_at)) / 1000))
  if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`
}
</script>

<template>
  <div>
    <PageHeader title="Server Dashboard" subtitle="Real-time host availability and problems" icon="i-lucide-server-cog" />

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="space-y-6">
      <div class="grid gap-4 md:grid-cols-4">
        <div class="panel p-5 flex flex-col items-center justify-center text-center">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Hosts</span>
          <span class="mt-2 text-4xl font-bold text-foam">{{ avail.total }}</span>
        </div>
        <div class="panel p-5 flex flex-col items-center justify-center text-center border-l-4 border-green-500">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Available</span>
          <span class="mt-2 text-4xl font-bold text-green-500">{{ avail.available }}</span>
        </div>
        <div class="panel p-5 flex flex-col items-center justify-center text-center border-l-4 border-red-500">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Unavailable</span>
          <span class="mt-2 text-4xl font-bold text-red-500">{{ avail.unavailable }}</span>
        </div>
        <div class="panel p-5 flex flex-col items-center justify-center text-center border-l-4 border-slate-500">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Open problems</span>
          <span class="mt-2 text-4xl font-bold text-orange-500">{{ openProblems.length }}</span>
        </div>
      </div>

      <div class="grid gap-4 xl:grid-cols-2">
        <section class="panel p-5">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-4">Problems by severity</h2>
          <div class="space-y-2">
            <div v-for="s in bySeverity" :key="s.value" class="flex items-center gap-3">
              <span class="w-28 text-xs" :class="s.text">{{ s.label }}</span>
              <div class="flex-1 h-2 rounded bg-surface-2 overflow-hidden">
                <div class="h-full rounded" :style="{ width: (openProblems.length ? (s.count / openProblems.length * 100) : 0) + '%', backgroundColor: s.hex }"></div>
              </div>
              <span class="w-8 text-right font-display font-semibold text-foam">{{ s.count }}</span>
            </div>
          </div>
        </section>

        <section class="panel p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Top problems</h2>
            <NuxtLink to="/monitoring/problems" class="text-xs text-beacon hover:underline">View all →</NuxtLink>
          </div>
          <div class="space-y-2">
            <div v-for="p in topProblems" :key="p.id" class="flex items-center gap-3 p-2 rounded-lg bg-surface-2 border border-surface">
              <span class="px-2 py-0.5 rounded text-xs font-medium shrink-0" :class="severityMeta(p.severity_num).badge">{{ severityMeta(p.severity_num).label }}</span>
              <div class="min-w-0 flex-1">
                <p class="text-sm text-foam truncate">{{ p.name }}</p>
                <p class="text-xs text-faint">{{ p.host }}</p>
              </div>
              <span class="text-xs text-faint shrink-0">{{ duration(p) }}</span>
            </div>
            <div v-if="!topProblems.length" class="text-center text-sm text-faint py-6">No open problems. All clear.</div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
