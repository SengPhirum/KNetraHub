<script setup lang="ts">
// Event Log — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'created_at', label: 'Time', type: 'datetime' },
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'event_type', label: 'Type' },
  { key: 'severity', label: 'Severity' },
  { key: 'message', label: 'Message' }
]
</script>

<template>
  <MonListPage title="Event Log" subtitle="Device, port, sensor, and alert state changes" icon="i-lucide-list" endpoint="/api/monitoring/v1/logs/events" :columns="columns" />
</template>
