<script setup lang="ts">
const { hasApp } = useAuth()

const { data: flows, status, refresh } = useAsyncData('netFlows', () => $fetch('/api/net/flows'), {
  server: false
})

onMounted(() => {
  const interval = setInterval(() => { if (!document.hidden) refresh() }, 10000)
  onUnmounted(() => clearInterval(interval))
})

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<template>
  <div>
    <PageHeader title="NetFlow Accounting" subtitle="Bandwidth analysis and flow records" icon="i-lucide-bar-chart" />

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
              <th class="px-4 py-3 font-medium">Protocol</th>
              <th class="px-4 py-3 font-medium">Source</th>
              <th class="px-4 py-3 font-medium">Destination</th>
              <th class="px-4 py-3 font-medium">Data</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-if="status === 'pending' && !flows" class="animate-pulse">
              <td colspan="6" class="px-4 py-8 text-center text-faint">Loading flows...</td>
            </tr>
            <tr v-else-if="flows?.length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-faint">No flow records.</td>
            </tr>
            <tr v-for="flow in flows" :key="flow.id" class="hover:bg-surface-2/50 transition">
              <td class="px-4 py-2 text-xs">{{ new Date(flow.timestamp).toLocaleString() }}</td>
              <td class="px-4 py-2 text-foam font-medium">{{ flow.device_name }}</td>
              <td class="px-4 py-2">{{ flow.protocol }}</td>
              <td class="px-4 py-2 font-mono text-xs">{{ flow.src_ip }}:{{ flow.src_port }}</td>
              <td class="px-4 py-2 font-mono text-xs">{{ flow.dst_ip }}:{{ flow.dst_port }}</td>
              <td class="px-4 py-2 text-foam">{{ formatBytes(flow.bytes) }} ({{ flow.packets }} pkts)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
