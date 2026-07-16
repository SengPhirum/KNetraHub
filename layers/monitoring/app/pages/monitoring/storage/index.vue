<script setup lang="ts">
// Storage — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'description', label: 'Filesystem' },
  { key: 'used_bytes', label: 'Used', align: 'right', type: 'bytes' },
  { key: 'total_bytes', label: 'Total', align: 'right', type: 'bytes' },
  { key: 'usage_percent', label: 'Usage', align: 'right', type: 'percent' }
]
</script>

<template>
  <MonListPage title="Storage" subtitle="Filesystem utilisation" icon="i-lucide-hard-drive" endpoint="/api/monitoring/v1/storage" :columns="columns" />
</template>
