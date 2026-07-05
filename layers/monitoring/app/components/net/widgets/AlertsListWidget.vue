<script setup lang="ts">
const alerts = useNetData('net-alerts', '/api/net/alerts')
const recent = computed<any[]>(() => (alerts.value || []).slice(0, 25))
</script>

<template>
  <div v-if="!recent.length" class="flex h-full items-center justify-center text-sm text-faint">No alerts.</div>
  <div v-else class="space-y-2">
    <div v-for="alert in recent" :key="alert.id" class="flex items-start gap-3 rounded-lg border border-surface bg-surface-2 p-2.5">
      <UIcon
        :name="alert.status === 'active' ? 'i-lucide-alert-triangle' : 'i-lucide-check-circle'"
        :class="alert.status === 'active' ? (alert.severity === 'critical' ? 'text-red-500' : 'text-orange-500') : 'text-green-500'"
        class="mt-0.5 size-4 shrink-0"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-foam">
          <NuxtLink :to="`/monitoring/network/devices/${alert.device_id}`" class="hover:underline">{{ alert.device_name || 'Unknown' }}</NuxtLink>
        </p>
        <p class="truncate text-xs text-(--color-muted)">{{ alert.message }}</p>
        <p class="mt-0.5 text-[11px] text-faint">{{ new Date(alert.timestamp).toLocaleString() }}</p>
      </div>
    </div>
  </div>
</template>
