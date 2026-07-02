<script setup lang="ts">
const hosts = useNetData('server-hosts', '/api/server/hosts')

const stats = computed(() => {
  const h = hosts.value || []
  return [
    { label: 'Total Hosts', value: h.length, color: 'text-foam' },
    { label: 'Available', value: h.filter((x: any) => x.availability === 'available').length, color: 'text-green-500' },
    { label: 'Unavailable', value: h.filter((x: any) => x.availability === 'unavailable').length, color: 'text-red-500' },
    { label: 'Paused', value: h.filter((x: any) => x.monitoring_enabled === false).length, color: 'text-orange-500' }
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
