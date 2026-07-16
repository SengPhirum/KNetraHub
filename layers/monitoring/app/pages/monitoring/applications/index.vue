<script setup lang="ts">
// Applications — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'app_type', label: 'Application' },
  { key: 'instance', label: 'Instance' },
  { key: 'status', label: 'Status' },
  { key: 'last_collected_at', label: 'Collected', align: 'right', type: 'datetime' }
]
</script>

<template>
  <MonListPage title="Applications" subtitle="Application monitoring" icon="i-lucide-app-window" endpoint="/api/monitoring/v1/applications" :columns="columns" />
</template>
