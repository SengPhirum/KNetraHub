<script setup lang="ts">
// Device Groups — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'name', label: 'Group' },
  { key: 'description', label: 'Description' },
  { key: 'dynamic', label: 'Type', format: (r) => r.dynamic ? 'Dynamic' : 'Static' },
  { key: 'device_count', label: 'Devices', align: 'right' }
]
</script>

<template>
  <MonListPage title="Device Groups" subtitle="Static and dynamic device groups" icon="i-lucide-folder-tree" endpoint="/api/monitoring/v1/device-groups" :columns="columns" />
</template>
