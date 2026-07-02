<script setup lang="ts">
// SNMP trap log (server/plugins/trapReceiver.ts, NUXT_SERVER_TRAP_ENABLED=true).
// Well-known traps (link down/up, cold/warm start, auth failure) from a known
// host also open/resolve a Problem — see /monitoring/problems for those.
const { hasApp } = useAuth()

const { data: traps, status, refresh } = useAsyncData('serverTraps', () => $fetch<any[]>('/api/server/traps'), { default: () => [], server: false })

onMounted(() => {
  const t = setInterval(refresh, 15000)
  onUnmounted(() => clearInterval(t))
})
</script>

<template>
  <div>
    <PageHeader title="SNMP Traps" subtitle="Incoming trap/inform log, matched to hosts where possible" icon="i-lucide-radio" />

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="panel">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-(--color-muted)">
          <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
            <tr>
              <th class="px-4 py-3 font-medium">Received</th>
              <th class="px-4 py-3 font-medium">Host</th>
              <th class="px-4 py-3 font-medium">Source IP</th>
              <th class="px-4 py-3 font-medium">Version</th>
              <th class="px-4 py-3 font-medium">Severity</th>
              <th class="px-4 py-3 font-medium">Trap</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-if="status === 'pending' && !traps.length" class="animate-pulse">
              <td colspan="6" class="px-4 py-8 text-center text-faint">Loading traps…</td>
            </tr>
            <tr v-else-if="!traps.length">
              <td colspan="6" class="px-4 py-8 text-center text-faint">No traps received yet.</td>
            </tr>
            <tr v-for="t in traps" :key="t.id" class="hover:bg-surface-2/50 transition text-xs">
              <td class="px-4 py-2 whitespace-nowrap font-mono">{{ new Date(t.received_at).toLocaleString() }}</td>
              <td class="px-4 py-2 text-foam font-sans">
                <NuxtLink v-if="t.host_id" :to="`/monitoring/server/hosts/${t.host_id}`" class="hover:underline">{{ t.host }}</NuxtLink>
                <span v-else class="text-faint">Unmatched</span>
              </td>
              <td class="px-4 py-2 font-mono">{{ t.source_ip }}</td>
              <td class="px-4 py-2 font-mono">{{ t.version }}</td>
              <td class="px-4 py-2">
                <span class="rounded px-2 py-0.5 font-medium" :class="severityMeta(t.severity_num).badge">{{ severityMeta(t.severity_num).label }}</span>
              </td>
              <td class="px-4 py-2 text-foam">{{ t.name }}<span v-if="t.trap_oid" class="ml-1 font-mono text-faint">({{ t.trap_oid }})</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
