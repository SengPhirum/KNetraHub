<script setup lang="ts">
// Failed/dead/running jobs with dead-letter replay (operator tier).
const { hasMonitoring, canOperate } = useMonitoring()
const toast = useToast()
const stateFilter = ref('all')
const url = computed(() => `/api/monitoring/v1/pollers/jobs${stateFilter.value !== 'all' ? '?state=' + stateFilter.value : ''}`)
const { data, status, refresh } = useAsyncData('monJobs',
  () => $fetch<any>(url.value),
  { server: false, default: () => ({ items: [] }), watch: [url] })
const replaying = ref<number | null>(null)
async function replay(id: number) {
  replaying.value = id
  try {
    await $fetch(`/api/monitoring/v1/pollers/jobs/${id}/replay`, { method: 'POST' })
    toast.add({ title: 'Job requeued', color: 'primary', icon: 'i-lucide-check' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Replay failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { replaying.value = null }
}
const stateItems = [
  { value: 'all', label: 'Pending + failed + dead + running' }, { value: 'pending', label: 'Pending only' },
  { value: 'running', label: 'Running' }, { value: 'failed', label: 'Failed' },
  { value: 'dead', label: 'Dead-letter' }, { value: 'done', label: 'Done' }
]
</script>

<template>
  <div>
    <PageHeader title="Jobs" subtitle="Durable queue — retries, backoff, dead-letter" icon="i-lucide-list-checks" />
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="space-y-4">
      <USelect v-model="stateFilter" :items="stateItems" size="sm" class="w-56" />
      <div class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">ID</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Device</th>
              <th class="px-3 py-2">State</th><th class="px-3 py-2 text-right">Attempts</th>
              <th class="px-3 py-2">Error</th><th class="px-3 py-2" /></tr>
          </thead>
          <tbody>
            <tr v-if="status === 'pending'"><td colspan="7" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
            <tr v-else-if="!data.items.length"><td colspan="7" class="px-3 py-8 text-center text-muted">No jobs in this state.</td></tr>
            <tr v-for="j in data.items" :key="j.id" class="border-t border-hull">
              <td class="px-3 py-2 text-faint">#{{ j.id }}</td>
              <td class="px-3 py-2">{{ j.type }}</td>
              <td class="px-3 py-2"><NuxtLink v-if="j.device_id" :to="`/monitoring/devices/${j.device_id}`" class="text-primary hover:underline">{{ j.hostname }}</NuxtLink><span v-else>—</span></td>
              <td class="px-3 py-2" :class="j.state === 'dead' ? 'text-rose-400' : j.state === 'failed' ? 'text-amber-400' : 'text-muted'">{{ j.state }}</td>
              <td class="px-3 py-2 text-right text-muted">{{ j.attempts }}/{{ j.max_attempts }}</td>
              <td class="px-3 py-2 max-w-md truncate text-xs text-faint" :title="j.last_error">{{ j.last_error || '—' }}</td>
              <td class="px-3 py-2 text-right">
                <UButton v-if="canOperate && ['pending','failed','dead'].includes(j.state)" size="xs" variant="soft"
                  :loading="replaying === j.id" @click="replay(j.id)">Run now</UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
