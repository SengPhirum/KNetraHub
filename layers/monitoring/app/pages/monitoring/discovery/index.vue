<script setup lang="ts">
// Discovery: CIDR scan (operator) — creates pending devices and queues full
// module discovery for each; results appear under Devices as jobs complete.
const { hasMonitoring, canOperate } = useMonitoring()
const toast = useToast()
const form = reactive({ cidr: '', poller_group: 0 })
const scanning = ref(false)
const lastResult = ref<any>(null)
async function scan() {
  scanning.value = true
  try {
    lastResult.value = await $fetch<any>('/api/monitoring/v1/discovery/scan', { method: 'POST', body: { ...form } })
    toast.add({ title: 'Scan queued', description: `${lastResult.value.created} device(s) created`, color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Scan failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { scanning.value = false }
}

// Recent discovery runs
const { data: runs } = useAsyncData('monDiscRuns',
  () => $fetch<any>('/api/monitoring/v1/pollers/jobs?state=pending'),
  { server: false, default: () => ({ items: [] }) })
</script>

<template>
  <div>
    <PageHeader title="Discovery" subtitle="CIDR sweeps and per-device module discovery" icon="i-lucide-scan-line" />
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="space-y-6">
      <div class="panel max-w-xl p-4">
        <h2 class="mb-3 font-semibold">Scan a network</h2>
        <p class="mb-3 text-sm text-muted">Adds every host in the CIDR as a pending device and queues full discovery
          (OS detection, ports, sensors, inventory…). Hosts that never respond stay
          <em>down/pending</em> and can be bulk-removed. Max /20 per scan.</p>
        <div class="flex gap-2">
          <UInput v-model="form.cidr" placeholder="192.168.1.0/24" class="flex-1" :disabled="!canOperate" />
          <UButton :loading="scanning" :disabled="!canOperate || !form.cidr" @click="scan">Scan</UButton>
        </div>
        <p v-if="!canOperate" class="mt-2 text-xs text-amber-400">Requires the Monitoring operator tier.</p>
        <div v-if="lastResult" class="mt-3 rounded bg-surface-2 p-3 text-sm">
          <div>Candidates: {{ lastResult.candidates }} · Created: {{ lastResult.created }} · Already present: {{ lastResult.skipped }}</div>
        </div>
      </div>
      <div class="panel p-4">
        <h2 class="mb-2 font-semibold">Pending jobs</h2>
        <p v-if="!runs?.items?.length" class="text-sm text-muted">No pending discovery/poll jobs.</p>
        <ul v-else class="space-y-1 text-sm">
          <li v-for="j in runs.items.slice(0, 20)" :key="j.id" class="flex justify-between border-t border-hull py-1.5 first:border-t-0">
            <span>{{ j.type }} · {{ j.hostname || 'system' }}</span>
            <span class="text-xs text-faint">{{ j.state }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
