<script setup lang="ts">
// Poller nodes + queue health.
const { hasMonitoring } = useMonitoring()
const { data, status, refresh } = useAsyncData('monPollers',
  () => $fetch<any>('/api/monitoring/v1/pollers'),
  { server: false, default: () => null })
let timer: any = null
onMounted(() => { timer = setInterval(refresh, 10000) })
onBeforeUnmount(() => timer && clearInterval(timer))
</script>

<template>
  <div>
    <PageHeader title="Pollers" subtitle="Distributed poller nodes and the durable job queue" icon="i-lucide-radio-tower">
      <template #actions><NuxtLink to="/monitoring/pollers/jobs"><UButton size="sm" variant="soft" icon="i-lucide-list-checks">Jobs</UButton></NuxtLink></template>
    </PageHeader>
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="panel p-4"><div class="text-xs uppercase text-faint">Pending due</div><div class="mt-1 text-2xl font-semibold">{{ data?.pending_due ?? '—' }}</div></div>
        <div class="panel p-4"><div class="text-xs uppercase text-faint">Running</div><div class="mt-1 text-2xl font-semibold">{{ data?.queue?.running ?? 0 }}</div></div>
        <div class="panel p-4"><div class="text-xs uppercase text-faint">Failed</div><div class="mt-1 text-2xl font-semibold text-amber-400">{{ data?.queue?.failed ?? 0 }}</div></div>
        <div class="panel p-4"><div class="text-xs uppercase text-faint">Dead-letter</div><div class="mt-1 text-2xl font-semibold text-rose-400">{{ data?.queue?.dead ?? 0 }}</div></div>
      </div>
      <div class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Node</th><th class="px-3 py-2">Group</th><th class="px-3 py-2">Health</th>
              <th class="px-3 py-2 text-right">In progress</th><th class="px-3 py-2 text-right">Completed</th>
              <th class="px-3 py-2 text-right">Failed</th><th class="px-3 py-2 text-right">Heartbeat</th></tr>
          </thead>
          <tbody>
            <tr v-if="status === 'pending'"><td colspan="7" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
            <tr v-for="n in data?.nodes || []" :key="n.id" class="border-t border-hull">
              <td class="px-3 py-2 font-medium">{{ n.id }}</td>
              <td class="px-3 py-2 text-muted">{{ n.poller_group }}</td>
              <td class="px-3 py-2"><span :class="n.healthy ? 'text-emerald-400' : 'text-rose-400'">{{ n.healthy ? 'Healthy' : 'Stale' }}</span></td>
              <td class="px-3 py-2 text-right">{{ n.jobs_in_progress }}</td>
              <td class="px-3 py-2 text-right">{{ n.jobs_completed }}</td>
              <td class="px-3 py-2 text-right">{{ n.jobs_failed }}</td>
              <td class="px-3 py-2 text-right text-xs text-faint">{{ n.last_heartbeat_at ? new Date(n.last_heartbeat_at).toLocaleTimeString() : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
