<script setup lang="ts">
// Ports — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'if_name', label: 'Port' },
  { key: 'oper_status', label: 'Status' },
  { key: 'speed_bps', label: 'Speed', align: 'right', type: 'bits' },
  { key: 'in_bps', label: 'In', align: 'right', type: 'bits' },
  { key: 'out_bps', label: 'Out', align: 'right', type: 'bits' },
  { key: 'in_util_percent', label: 'In util', align: 'right', type: 'percent' }
]
</script>

<template>
  <MonListPage title="Ports" subtitle="Every discovered interface" icon="i-lucide-ethernet-port" endpoint="/api/monitoring/v1/ports" :columns="columns" />
</template>
