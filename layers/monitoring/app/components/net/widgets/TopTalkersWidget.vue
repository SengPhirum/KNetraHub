<script setup lang="ts">
const flows = useNetData('net-flows', '/api/net/flows')
const top = computed<any[]>(() => (flows.value || []).slice(0, 25))

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
</script>

<template>
  <div v-if="!top.length" class="flex h-full items-center justify-center text-sm text-faint">No flow data.</div>
  <div v-else class="space-y-2">
    <div v-for="flow in top" :key="flow.id" class="flex flex-col gap-1 rounded-lg border border-surface bg-surface-2 p-2.5">
      <div class="flex items-center justify-between text-sm">
        <span class="truncate font-medium text-foam">{{ flow.device_name || 'Unknown' }}</span>
        <span class="ml-2 shrink-0 font-mono text-primary-400">{{ formatBytes(flow.bytes) }}</span>
      </div>
      <div class="flex items-center justify-between text-xs text-faint">
        <span class="truncate font-mono">{{ flow.src_ip }} &rarr; {{ flow.dst_ip }}</span>
        <span class="ml-2 shrink-0 uppercase">{{ flow.protocol }}</span>
      </div>
    </div>
  </div>
</template>
