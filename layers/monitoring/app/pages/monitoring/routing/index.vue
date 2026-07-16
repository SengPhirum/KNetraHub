<script setup lang="ts">
// Routing — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'peer_ip', label: 'BGP Peer' },
  { key: 'peer_as', label: 'Peer AS', align: 'right' },
  { key: 'state', label: 'State' },
  { key: 'accepted_prefixes', label: 'Prefixes', align: 'right' }
]
</script>

<template>
  <MonListPage title="Routing" subtitle="BGP peers and OSPF neighbors" icon="i-lucide-route" endpoint="/api/monitoring/v1/routing/bgp" :columns="columns" />
</template>
