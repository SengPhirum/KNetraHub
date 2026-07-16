<script setup lang="ts">
// Switching — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'vlan_id', label: 'VLAN', align: 'right' },
  { key: 'name', label: 'Name' },
  { key: 'state', label: 'State' }
]
</script>

<template>
  <MonListPage title="Switching" subtitle="VLANs, FDB, ARP, and neighbors" icon="i-lucide-arrow-left-right" endpoint="/api/monitoring/v1/switching/vlans" :columns="columns" />
</template>
