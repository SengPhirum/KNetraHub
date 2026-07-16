<script setup lang="ts">
// Locations — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'name', label: 'Location' },
  { key: 'device_count', label: 'Devices', align: 'right' },
  { key: 'latitude', label: 'Latitude', align: 'right' },
  { key: 'longitude', label: 'Longitude', align: 'right' }
]
</script>

<template>
  <MonListPage title="Locations" subtitle="Geographic and logical sites" icon="i-lucide-map-pin" endpoint="/api/monitoring/v1/locations" :columns="columns" />
</template>
