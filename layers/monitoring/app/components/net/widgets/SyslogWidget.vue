<script setup lang="ts">
const syslog = useNetData('net-syslog', '/api/net/syslog')
const lines = computed<any[]>(() => (syslog.value || []).slice(0, 50))

function sevClass(sev: string) {
  const s = String(sev || '').toLowerCase()
  if (['emergency', 'alert', 'critical', 'error', 'err'].includes(s)) return 'text-red-500'
  if (['warning', 'warn', 'notice'].includes(s)) return 'text-orange-500'
  return 'text-faint'
}
</script>

<template>
  <div v-if="!lines.length" class="flex h-full items-center justify-center text-sm text-faint">No syslog entries.</div>
  <div v-else class="space-y-1 font-mono text-xs">
    <div v-for="l in lines" :key="l.id" class="flex items-start gap-2 border-b border-surface/60 pb-1">
      <span class="shrink-0 text-faint">{{ new Date(l.timestamp).toLocaleTimeString() }}</span>
      <span class="shrink-0 font-semibold uppercase" :class="sevClass(l.severity)">{{ l.severity || 'info' }}</span>
      <span class="shrink-0 text-(--color-muted)">{{ l.device_name || l.program || '' }}</span>
      <span class="min-w-0 flex-1 truncate text-foam" :title="l.message">{{ l.message }}</span>
    </div>
  </div>
</template>
