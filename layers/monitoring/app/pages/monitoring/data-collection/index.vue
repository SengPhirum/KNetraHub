<script setup lang="ts">
// Data Collection coverage: the no-silent-loss audit surface. Shows per-device
// completeness from the latest poll run, plus a failures feed.
const { hasMonitoring } = useMonitoring()
const route = useRoute()
const tab = ref('coverage')

const { data: coverage, status } = useAsyncData('monCoverage',
  () => $fetch<any>('/api/monitoring/v1/data-quality/coverage'),
  { server: false, default: () => ({ items: [], summary: {} }) })

const failuresUrl = computed(() => `/api/monitoring/v1/data-quality/failures${route.query.device_id ? '?device_id=' + route.query.device_id : ''}`)
const { data: failures } = useAsyncData('monFailures',
  () => $fetch<any>(failuresUrl.value),
  { server: false, default: () => ({ items: [], by_outcome_24h: [] }), watch: [failuresUrl] })

function stateClass(s: string) {
  return s === 'complete' ? 'text-emerald-400' : s === 'stale' ? 'text-amber-400' : s === 'never polled' ? 'text-violet-400' : 'text-rose-400'
}
</script>

<template>
  <div>
    <PageHeader title="Data Collection" subtitle="Collection completeness — every planned item has a recorded outcome" icon="i-lucide-database-zap" />
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="space-y-4">
      <!-- Summary -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="panel p-4"><div class="text-xs uppercase text-faint">Devices</div><div class="mt-1 text-2xl font-semibold">{{ coverage?.summary?.total_devices ?? '—' }}</div></div>
        <div class="panel p-4"><div class="text-xs uppercase text-faint">Complete runs</div><div class="mt-1 text-2xl font-semibold text-emerald-400">{{ coverage?.summary?.complete_runs ?? '—' }}</div></div>
        <div class="panel p-4"><div class="text-xs uppercase text-faint">Incomplete runs</div><div class="mt-1 text-2xl font-semibold text-amber-400">{{ coverage?.summary?.incomplete_runs ?? '—' }}</div></div>
        <div class="panel p-4"><div class="text-xs uppercase text-faint">Stale devices</div><div class="mt-1 text-2xl font-semibold text-rose-400">{{ coverage?.summary?.stale ?? '—' }}</div></div>
      </div>

      <div class="flex gap-1 border-b border-hull">
        <button :class="['px-3 py-2 text-sm', tab === 'coverage' ? 'border-b-2 border-primary text-primary' : 'text-muted']" @click="tab = 'coverage'">Coverage</button>
        <button :class="['px-3 py-2 text-sm', tab === 'failures' ? 'border-b-2 border-primary text-primary' : 'text-muted']" @click="tab = 'failures'">Failures</button>
      </div>

      <div v-if="tab === 'coverage'" class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Device</th><th class="px-3 py-2">Coverage</th><th class="px-3 py-2 text-right">Completeness</th>
              <th class="px-3 py-2 text-right">Planned</th><th class="px-3 py-2 text-right">OK</th>
              <th class="px-3 py-2 text-right">Unsupported</th><th class="px-3 py-2 text-right">Failed</th><th class="px-3 py-2 text-right">Last poll</th></tr>
          </thead>
          <tbody>
            <tr v-if="status === 'pending'"><td colspan="8" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
            <tr v-for="d in coverage.items" :key="d.device_id" class="border-t border-hull">
              <td class="px-3 py-2"><NuxtLink :to="`/monitoring/devices/${d.device_id}`" class="text-primary hover:underline">{{ d.hostname }}</NuxtLink></td>
              <td class="px-3 py-2"><span :class="stateClass(d.coverage_state)">{{ d.coverage_state }}</span></td>
              <td class="px-3 py-2 text-right">{{ d.completeness_percent != null ? d.completeness_percent + '%' : '—' }}</td>
              <td class="px-3 py-2 text-right">{{ d.planned_items ?? '—' }}</td>
              <td class="px-3 py-2 text-right">{{ d.succeeded_items ?? '—' }}</td>
              <td class="px-3 py-2 text-right text-muted">{{ d.unsupported_items ?? '—' }}</td>
              <td class="px-3 py-2 text-right" :class="d.failed_items ? 'text-rose-400' : ''">{{ d.failed_items ?? '—' }}</td>
              <td class="px-3 py-2 text-right text-xs text-faint">{{ d.last_polled_at ? new Date(d.last_polled_at).toLocaleString() : 'never' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="space-y-4">
        <div v-if="failures?.by_outcome_24h?.length" class="panel p-4">
          <h3 class="mb-2 text-sm font-semibold">Failures by outcome (24h)</h3>
          <div class="flex flex-wrap gap-3 text-sm">
            <span v-for="o in failures.by_outcome_24h" :key="o.outcome" class="rounded bg-surface-2 px-2 py-1">
              <span class="text-muted">{{ o.outcome }}</span> <strong>{{ o.c }}</strong>
            </span>
          </div>
        </div>
        <div class="panel overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
              <tr><th class="px-3 py-2">Time</th><th class="px-3 py-2">Device</th><th class="px-3 py-2">Module</th>
                <th class="px-3 py-2">Item</th><th class="px-3 py-2">Outcome</th><th class="px-3 py-2">Detail</th></tr>
            </thead>
            <tbody>
              <tr v-if="!failures?.items?.length"><td colspan="6" class="px-3 py-8 text-center text-muted">No recent failures.</td></tr>
              <tr v-for="(f, i) in failures.items" :key="i" class="border-t border-hull">
                <td class="px-3 py-2 whitespace-nowrap text-xs text-faint">{{ new Date(f.time).toLocaleString() }}</td>
                <td class="px-3 py-2"><NuxtLink v-if="f.device_id" :to="`/monitoring/devices/${f.device_id}`" class="text-primary hover:underline">{{ f.hostname }}</NuxtLink></td>
                <td class="px-3 py-2 text-muted">{{ f.module }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ f.item }}</td>
                <td class="px-3 py-2 text-rose-400">{{ f.outcome }}</td>
                <td class="px-3 py-2 text-xs text-faint">{{ f.detail }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
