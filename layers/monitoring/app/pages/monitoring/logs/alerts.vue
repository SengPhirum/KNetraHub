<script setup lang="ts">
// Alert Log — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'at', label: 'Time', type: 'datetime' },
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'rule_name', label: 'Rule' },
  { key: 'from_state', label: 'From' },
  { key: 'to_state', label: 'To' },
  { key: 'actor', label: 'Actor' }
]
</script>

<template>
  <MonListPage title="Alert Log" subtitle="Alert state transitions" icon="i-lucide-bell" endpoint="/api/monitoring/v1/logs/alerts" :columns="columns" />
</template>
