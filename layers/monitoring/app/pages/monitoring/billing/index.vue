<script setup lang="ts">
// Billing — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'name', label: 'Bill' },
  { key: 'bill_type', label: 'Type' },
  { key: 'direction', label: 'Direction' }
]
</script>

<template>
  <MonListPage title="Billing" subtitle="95th-percentile and quota traffic bills" icon="i-lucide-receipt" endpoint="/api/monitoring/v1/bills" :columns="columns" />
</template>
