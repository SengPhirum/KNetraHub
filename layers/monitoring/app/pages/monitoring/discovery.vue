<script setup lang="ts">
// Unified Discovery: Network device discovery (/api/net/discovery) and Server
// host discovery (/api/server/discovery) are two different scans underneath,
// but from here they're one page — pick a target type, run the scan, and see
// one merged history list where each row is tagged with its type.
const { hasApp, hasPermission } = useAuth()
const canScan = computed(() => hasPermission('monitoring.scan'))

const { data: netJobs, refresh: refreshNet } = useAsyncData('unifiedNetDiscoveryJobs', () => $fetch<any[]>('/api/net/discovery'), { default: () => [], server: false })
const { data: srvJobs, refresh: refreshSrv } = useAsyncData('unifiedSrvDiscoveryJobs', () => $fetch<any[]>('/api/server/discovery'), { default: () => [], server: false })
async function refreshHistory() { await Promise.all([refreshNet(), refreshSrv()]) }

const history = computed(() => {
  const net = (netJobs.value || []).map((j: any) => ({ ...j, type: 'network' }))
  const srv = (srvJobs.value || []).map((j: any) => ({ ...j, type: 'server' }))
  return [...net, ...srv].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
})

const target = ref<'network' | 'server'>('network')
const targetItems = [{ value: 'network', label: 'Network devices (ping/SNMP)' }, { value: 'server', label: 'Server hosts (ICMP/SNMP)' }]
const netMethods = [{ value: 'ping+snmp', label: 'Ping + SNMP' }, { value: 'ping', label: 'Ping only' }, { value: 'snmp', label: 'SNMP only' }]
const srvMethods = [{ value: 'icmp+snmp', label: 'Ping + SNMP' }, { value: 'icmp', label: 'Ping only' }]
const methodItems = computed(() => (target.value === 'network' ? netMethods : srvMethods))

const cidr = ref('192.168.1.0/24')
const method = ref('ping+snmp')
const community = ref('')
const scanning = ref(false)
const lastResult = ref<any>(null)
const scanError = ref('')

watch(target, (t) => { method.value = t === 'network' ? 'ping+snmp' : 'icmp+snmp' })

async function runScan() {
  if (scanning.value) return
  scanning.value = true
  lastResult.value = null
  scanError.value = ''
  try {
    const url = target.value === 'network' ? '/api/net/discovery' : '/api/server/discovery'
    const result = await $fetch<any>(url, { method: 'POST', body: { cidr: cidr.value, method: method.value, community: community.value || undefined } })
    lastResult.value = { ...result, type: target.value }
    await refreshHistory()
  } catch (e: any) {
    scanError.value = e?.data?.statusMessage || e?.statusMessage || 'Scan failed. Check the range and try again.'
  } finally {
    scanning.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Discovery" subtitle="Scan a range to create network devices or server hosts" icon="i-lucide-scan-line" />

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="space-y-6">
      <!-- Scan launcher -->
      <div class="panel p-5">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-4">New Discovery Scan</h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <UFormField label="Target">
            <USelect v-model="target" :items="targetItems" value-key="value" label-key="label" class="w-full" :disabled="!canScan" />
          </UFormField>
          <UFormField label="IP Range (CIDR)" hint="≤ 1024 hosts">
            <UInput v-model="cidr" placeholder="192.168.1.0/24" class="w-full" :disabled="!canScan" />
          </UFormField>
          <UFormField label="Method">
            <USelect v-model="method" :items="methodItems" value-key="value" label-key="label" class="w-full" :disabled="!canScan" />
          </UFormField>
          <UFormField label="SNMP community" hint="optional">
            <UInput v-model="community" type="password" placeholder="default (public)" class="w-full" :disabled="!canScan || !method.includes('snmp')" />
          </UFormField>
          <UButton icon="i-lucide-radar" :loading="scanning" :disabled="!canScan" @click="runScan">{{ scanning ? 'Scanning…' : 'Start Scan' }}</UButton>
        </div>
        <p v-if="!canScan" class="mt-3 text-xs text-faint">Running discovery requires the Monitoring operator tier.</p>
        <div v-if="scanError" class="mt-4 flex items-center gap-3 rounded-lg bg-red-500/10 ring-1 ring-red-500/20 px-4 py-3 text-sm">
          <UIcon name="i-lucide-alert-triangle" class="size-5 text-red-500 shrink-0" />
          <span class="text-foam">{{ scanError }}</span>
        </div>
        <div v-if="lastResult" class="mt-4 flex items-center gap-3 rounded-lg bg-green-500/10 ring-1 ring-green-500/20 px-4 py-3 text-sm">
          <UIcon name="i-lucide-check-circle" class="size-5 text-green-500 shrink-0" />
          <span class="text-foam">
            Scanned <strong>{{ lastResult.scanned }}</strong> addresses —
            <strong>{{ lastResult.found }}</strong> responded,
            added <strong>{{ lastResult.added }}</strong> new {{ lastResult.type === 'network' ? 'device' : 'host' }}{{ lastResult.added === 1 ? '' : 's' }}.
          </span>
          <NuxtLink :to="lastResult.type === 'network' ? '/monitoring/network/devices' : '/monitoring/server/hosts'" class="ml-auto text-xs text-beacon hover:underline shrink-0">View inventory →</NuxtLink>
        </div>
      </div>

      <!-- Combined history -->
      <div class="panel">
        <div class="px-5 py-4 border-b border-surface">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Scan History</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-(--color-muted)">
            <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
              <tr>
                <th class="px-4 py-3 font-medium">Started</th>
                <th class="px-4 py-3 font-medium">Type</th>
                <th class="px-4 py-3 font-medium">Range</th>
                <th class="px-4 py-3 font-medium">Method</th>
                <th class="px-4 py-3 font-medium text-right">Scanned</th>
                <th class="px-4 py-3 font-medium text-right">Found</th>
                <th class="px-4 py-3 font-medium text-right">Added</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-if="!history.length"><td colspan="7" class="px-4 py-8 text-center text-faint">No scans yet. Start one above.</td></tr>
              <tr v-for="job in history" :key="`${job.type}:${job.id}`" class="hover:bg-surface-2/50 transition">
                <td class="px-4 py-3 text-xs whitespace-nowrap">{{ new Date(job.started_at).toLocaleString() }}</td>
                <td class="px-4 py-3"><UBadge :color="job.type === 'network' ? 'info' : 'primary'" variant="subtle" size="xs" class="capitalize">{{ job.type }}</UBadge></td>
                <td class="px-4 py-3 font-mono text-foam">{{ job.cidr }}</td>
                <td class="px-4 py-3 uppercase text-xs">{{ job.method }}</td>
                <td class="px-4 py-3 text-right font-mono">{{ job.scanned }}</td>
                <td class="px-4 py-3 text-right font-mono">{{ job.found }}</td>
                <td class="px-4 py-3 text-right font-mono text-foam">{{ job.added }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
