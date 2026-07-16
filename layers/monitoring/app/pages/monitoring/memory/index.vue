<script setup lang="ts">
// Memory — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'description', label: 'Pool' },
  { key: 'used_bytes', label: 'Used', align: 'right', type: 'bytes' },
  { key: 'total_bytes', label: 'Total', align: 'right', type: 'bytes' },
  { key: 'usage_percent', label: 'Usage', align: 'right', type: 'percent' }
]
</script>

<template>
  <MonListPage title="Memory" subtitle="Memory pool utilisation" icon="i-lucide-memory-stick" endpoint="/api/monitoring/v1/memory" :columns="columns" />
</template>
