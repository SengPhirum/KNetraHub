<script setup lang="ts">
const sensors = useNetData('net-sensors', '/api/net/sensors')
const list = computed<any[]>(() => (sensors.value || []).slice(0, 40))

function state(s: any): { label: string; cls: string } {
  if (s.device_status === 'down') return { label: 'Down', cls: 'text-red-500' }
  const v = s.current_value
  const hi = s.limit_high
  const lo = s.limit_low
  if (v != null && ((hi != null && v > hi) || (lo != null && v < lo))) return { label: 'Warning', cls: 'text-orange-500' }
  return { label: 'OK', cls: 'text-green-500' }
}
</script>

<template>
  <div v-if="!list.length" class="flex h-full items-center justify-center text-sm text-faint">No sensors.</div>
  <div v-else class="space-y-1.5">
    <div v-for="s in list" :key="s.id" class="flex items-center justify-between gap-3 rounded-lg border border-surface bg-surface-2 px-3 py-2">
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-foam">{{ s.name }}</p>
        <p class="truncate text-xs text-faint">{{ s.device_name }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <span class="font-mono text-sm text-foam">{{ s.current_value != null ? `${s.current_value}${s.unit ? ' ' + s.unit : ''}` : '—' }}</span>
        <span class="text-xs font-semibold" :class="state(s).cls">{{ state(s).label }}</span>
      </div>
    </div>
  </div>
</template>
