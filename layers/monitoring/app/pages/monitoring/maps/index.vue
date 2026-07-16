<script setup lang="ts">
// Maps — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'protocol', label: 'Protocol' },
  { key: 'remote_hostname', label: 'Neighbor' },
  { key: 'remote_port', label: 'Remote port' },
  { key: 'remote_platform', label: 'Platform' }
]
</script>

<template>
  <MonListPage title="Maps" subtitle="Topology and availability maps" icon="i-lucide-map" endpoint="/api/monitoring/v1/switching/neighbors" :columns="columns" />
</template>
