<script setup lang="ts">
const { hasApp } = useAuth()

const { data: logs, status, refresh } = useAsyncData('netSyslog', () => $fetch('/api/net/syslog'), {
  server: false
})

onMounted(() => {
  const interval = setInterval(() => { if (!document.hidden) refresh() }, 10000)
  onUnmounted(() => clearInterval(interval))
})
</script>

<template>
  <div>
    <PageHeader title="Syslog" subtitle="Real-time device event logs" icon="i-lucide-list" />

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="panel">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-(--color-muted)">
          <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
            <tr>
              <th class="px-4 py-3 font-medium">Timestamp</th>
              <th class="px-4 py-3 font-medium">Device</th>
              <th class="px-4 py-3 font-medium">Facility / Program</th>
              <th class="px-4 py-3 font-medium">Severity</th>
              <th class="px-4 py-3 font-medium">Message</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-if="status === 'pending' && !logs" class="animate-pulse">
              <td colspan="5" class="px-4 py-8 text-center text-faint">Loading logs...</td>
            </tr>
            <tr v-else-if="logs?.length === 0">
              <td colspan="5" class="px-4 py-8 text-center text-faint">No syslog entries found.</td>
            </tr>
            <tr v-for="log in logs" :key="log.id" class="hover:bg-surface-2/50 transition font-mono text-xs">
              <td class="px-4 py-2 whitespace-nowrap">{{ new Date(log.timestamp).toLocaleString() }}</td>
              <td class="px-4 py-2 text-foam font-sans">{{ log.device_name || 'Unknown' }}</td>
              <td class="px-4 py-2">{{ log.facility }} / {{ log.program }}</td>
              <td class="px-4 py-2">
                <UBadge size="xs" variant="soft" :color="log.severity === 'err' ? 'red' : log.severity === 'warning' ? 'orange' : 'blue'">
                  {{ log.severity }}
                </UBadge>
              </td>
              <td class="px-4 py-2 text-foam">{{ log.message }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
