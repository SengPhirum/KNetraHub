<script setup lang="ts">
const devices = useNetData('net-devices', '/api/net/devices')

function icon(cat: string) {
  return cat === 'network' ? 'i-lucide-network'
    : cat === 'storage' ? 'i-lucide-database'
    : cat === 'iot' ? 'i-lucide-cpu'
    : 'i-lucide-server'
}
</script>

<template>
  <div v-if="!(devices || []).length" class="flex h-full items-center justify-center text-sm text-faint">No devices.</div>
  <div v-else class="flex flex-wrap gap-2.5">
    <NuxtLink
      v-for="dev in devices"
      :key="dev.id"
      :to="`/monitoring/network/devices/${dev.id}`"
      class="flex w-28 shrink-0 flex-col items-center justify-center rounded-xl border p-3 transition"
      :class="dev.status === 'up'
        ? 'border-green-500/20 bg-green-500/5 hover:border-green-500/50'
        : 'border-red-500/20 bg-red-500/5 hover:border-red-500/50'"
    >
      <UIcon :name="icon(dev.category)" class="mb-1.5 size-7" :class="dev.status === 'up' ? 'text-green-500' : 'text-red-500'" />
      <span class="w-full truncate text-center text-xs font-medium text-foam">{{ dev.hostname }}</span>
      <span class="mt-0.5 text-[10px] uppercase text-faint">{{ dev.status }}</span>
    </NuxtLink>
  </div>
</template>
