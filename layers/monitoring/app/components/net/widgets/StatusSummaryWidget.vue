<script setup lang="ts">
const devices = useNetData('net-devices', '/api/net/devices')
const alerts = useNetData('net-alerts', '/api/net/alerts')

const stats = computed(() => {
  const d = devices.value || []
  const a = alerts.value || []
  return [
    { label: 'Total Devices', value: d.length, color: 'text-foam' },
    { label: 'Up', value: d.filter((x: any) => x.status === 'up').length, color: 'text-green-500' },
    { label: 'Down', value: d.filter((x: any) => x.status === 'down').length, color: 'text-red-500' },
    { label: 'Active Alerts', value: a.filter((x: any) => x.status === 'active').length, color: 'text-orange-500' }
  ]
})
</script>

<template>
  <div class="grid h-full grid-cols-2 gap-3 sm:grid-cols-4">
    <div v-for="s in stats" :key="s.label" class="flex flex-col justify-center rounded-lg bg-surface-2 px-4 py-2">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-faint">{{ s.label }}</span>
      <span class="mt-1 font-display text-2xl font-bold" :class="s.color">{{ s.value }}</span>
    </div>
  </div>
</template>
