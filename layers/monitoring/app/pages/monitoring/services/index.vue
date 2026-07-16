<script setup lang="ts">
// Services — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'name', label: 'Service' },
  { key: 'type', label: 'Type' },
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'status', label: 'Status' },
  { key: 'last_response_ms', label: 'Response', align: 'right', format: (r) => r.last_response_ms != null ? r.last_response_ms.toFixed(0) + ' ms' : '—' },
  { key: 'status_message', label: 'Message' }
]
</script>

<template>
  <MonListPage title="Services" subtitle="Active service checks" icon="i-lucide-gauge-circle" endpoint="/api/monitoring/v1/services" :columns="columns" />
</template>
