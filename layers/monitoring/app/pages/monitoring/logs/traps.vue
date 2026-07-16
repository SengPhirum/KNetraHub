<script setup lang="ts">
// SNMP Traps — read-only Monitoring resource list backed by real collected data.
const columns = [
  { key: 'received_at', label: 'Time', type: 'datetime' },
  { key: 'hostname', label: 'Device', type: 'device' },
  { key: 'source_ip', label: 'Source' },
  { key: 'trap_oid', label: 'Trap OID' },
  { key: 'handler', label: 'Handler' },
  { key: 'handler_result', label: 'Result' }
]
</script>

<template>
  <MonListPage title="SNMP Traps" subtitle="Received SNMP traps and handler results" icon="i-lucide-radio" endpoint="/api/monitoring/v1/logs/traps" :columns="columns" />
</template>
