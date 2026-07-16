<script setup lang="ts">
// Syslog — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'time', label: 'Time', type: 'datetime' },
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'source_ip', label: 'Source' },
  { key: 'severity', label: 'Sev', align: 'right' },
  { key: 'app_name', label: 'App' },
  { key: 'message', label: 'Message' }
]
</script>

<template>
  <MonListPage title="Syslog" subtitle="Ingested syslog messages (RFC 3164/5424)" icon="i-lucide-scroll-text" endpoint="/api/monitoring/v1/logs/syslog" :columns="columns" />
</template>
