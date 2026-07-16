<script setup lang="ts">
// Inventory — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'class', label: 'Class' },
  { key: 'name', label: 'Name' },
  { key: 'model', label: 'Model' },
  { key: 'serial', label: 'Serial' },
  { key: 'manufacturer', label: 'Vendor' }
]
</script>

<template>
  <MonListPage title="Inventory" subtitle="Physical hardware components" icon="i-lucide-package" endpoint="/api/monitoring/v1/inventory" :columns="columns" />
</template>
