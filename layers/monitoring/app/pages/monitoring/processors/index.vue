<script setup lang="ts">
// Processors — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'description', label: 'Processor' },
  { key: 'usage_percent', label: 'Usage', align: 'right', type: 'percent' }
]
</script>

<template>
  <MonListPage title="Processors" subtitle="CPU utilisation across the fleet" icon="i-lucide-cpu" endpoint="/api/monitoring/v1/processors" :columns="columns" />
</template>
