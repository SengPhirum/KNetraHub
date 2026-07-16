<script setup lang="ts">
// Health Sensors — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'description', label: 'Sensor' },
  { key: 'sensor_class', label: 'Class' },
  { key: 'current_value', label: 'Value', align: 'right', format: (r) => r.current_value != null ? r.current_value.toFixed(2) + ' ' + (r.unit || '') : '—' },
  { key: 'status', label: 'Status' }
]
</script>

<template>
  <MonListPage title="Health Sensors" subtitle="Temperature, voltage, fan, power and more" icon="i-lucide-gauge" endpoint="/api/monitoring/v1/health" :columns="columns" />
</template>
