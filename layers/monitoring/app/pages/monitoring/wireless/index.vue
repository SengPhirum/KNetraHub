<script setup lang="ts">
// Wireless — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'description', label: 'Sensor' },
  { key: 'wireless_class', label: 'Class' },
  { key: 'current_value', label: 'Value', align: 'right', format: (r) => r.current_value != null ? r.current_value + ' ' + (r.unit||'') : '—' }
]
</script>

<template>
  <MonListPage title="Wireless" subtitle="Access points, radios, and clients" icon="i-lucide-wifi" endpoint="/api/monitoring/v1/wireless" :columns="columns" />
</template>
