<script setup lang="ts">
// Zabbix Discovery: sweep a CIDR (ICMP, optionally + SNMP) to auto-create hosts.
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canScan = computed(() => hasPermission('monitoring.scan'))

const { data: jobs, refresh } = useAsyncData('serverDiscoveryJobs', () => $fetch<any[]>('/api/server/discovery'), { default: () => [], server: false })

const cidr = ref('')
const method = ref('icmp+snmp')
const community = ref('')
const running = ref(false)
const lastResult = ref<any>(null)
const methods = [{ value: 'icmp', label: 'Ping only' }, { value: 'icmp+snmp', label: 'Ping + SNMP' }]

async function run() {
  if (!cidr.value.trim()) { toast.add({ title: 'Enter a CIDR', color: 'error' }); return }
  running.value = true; lastResult.value = null
  try {
    lastResult.value = await $fetch('/api/server/discovery', { method: 'POST', body: { cidr: cidr.value, method: method.value, community: community.value } })
    toast.add({ title: `Scan complete: ${lastResult.value.added} host(s) added`, color: 'primary', icon: 'i-lucide-check' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Scan failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { running.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="Discovery" subtitle="Scan an IP range to auto-create hosts" icon="i-lucide-scan-line" />

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="space-y-6">
      <div class="panel p-5">
        <div class="grid gap-3 sm:grid-cols-4 items-end">
          <UFormField label="CIDR"><UInput v-model="cidr" placeholder="10.0.1.0/24" class="w-full" :disabled="!canScan" /></UFormField>
          <UFormField label="Method"><USelect v-model="method" :items="methods" value-key="value" label-key="label" class="w-full" :disabled="!canScan" /></UFormField>
          <UFormField label="SNMP community"><UInput v-model="community" type="password" placeholder="public" class="w-full" :disabled="!canScan || method === 'icmp'" /></UFormField>
          <UButton icon="i-lucide-radar" :loading="running" :disabled="!canScan" @click="run">Scan</UButton>
        </div>
        <p v-if="!canScan" class="mt-3 text-xs text-faint">Running discovery requires the Monitoring operator tier.</p>
        <div v-if="lastResult" class="mt-4 flex gap-6 border-t border-hull pt-4 text-sm">
          <div><span class="text-faint">Scanned</span> <span class="text-foam font-semibold">{{ lastResult.scanned }}</span></div>
          <div><span class="text-faint">Responding</span> <span class="text-foam font-semibold">{{ lastResult.found }}</span></div>
          <div><span class="text-faint">Added</span> <span class="text-emerald-500 font-semibold">{{ lastResult.added }}</span></div>
          <NuxtLink to="/monitoring/server/hosts" class="ml-auto text-xs text-beacon hover:underline">View hosts →</NuxtLink>
        </div>
      </div>

      <div class="panel">
        <div class="p-3 text-xs font-semibold uppercase text-faint border-b border-surface">Scan history</div>
        <table class="w-full text-left text-sm text-(--color-muted)">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-4 py-2">Started</th><th>CIDR</th><th>Method</th><th>Scanned</th><th>Found</th><th>Added</th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="j in jobs" :key="j.id" class="hover:bg-surface-2/40">
              <td class="px-4 py-2 text-xs">{{ new Date(j.started_at).toLocaleString() }}</td>
              <td class="font-mono text-xs">{{ j.cidr }}</td>
              <td class="text-xs uppercase">{{ j.method }}</td>
              <td>{{ j.scanned }}</td><td>{{ j.found }}</td><td class="text-emerald-500">{{ j.added }}</td>
            </tr>
            <tr v-if="!jobs.length"><td colspan="6" class="px-4 py-6 text-center text-faint">No scans yet.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
