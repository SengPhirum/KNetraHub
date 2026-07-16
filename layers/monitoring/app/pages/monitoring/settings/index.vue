<script setup lang="ts">
// Monitoring settings: read-only view of effective runtime configuration and
// links to the admin surfaces. Values come from env (NUXT_MONITORING_*);
// per-device overrides live on each device's settings.
const { hasMonitoring, canManage } = useMonitoring()
const { data } = useAsyncData('monSettingsStatus',
  () => $fetch<any>('/api/monitoring/v1/system/status'),
  { server: false, default: () => null })
const rows = [
  ['Poll interval', 'NUXT_MONITORING_POLL_INTERVAL_SECONDS', '300s default; per-device override on the device page'],
  ['Rediscovery interval', 'NUXT_MONITORING_DISCOVERY_INTERVAL_SECONDS', '21600s (6h) default'],
  ['Worker concurrency', 'NUXT_MONITORING_WORKER_CONCURRENCY', '16 concurrent jobs per node'],
  ['SNMP timeout / retries', 'NUXT_MONITORING_SNMP_TIMEOUT_MS / _RETRIES', '3000ms / 2'],
  ['Trap receiver', 'NUXT_MONITORING_TRAP_ENABLED / _PORT', 'off by default; UDP 1162'],
  ['Syslog receiver', 'NUXT_MONITORING_SYSLOG_ENABLED / _PORT', 'off by default; UDP+TCP 1514'],
  ['Metric retention', 'NUXT_MONITORING_METRIC_RETENTION_DAYS', '30 days'],
  ['Event retention', 'NUXT_MONITORING_EVENT_RETENTION_DAYS', '90 days']
]
</script>

<template>
  <div>
    <PageHeader title="Settings" subtitle="Monitoring runtime configuration" icon="i-lucide-settings" />
    <div v-if="!hasMonitoring || !canManage" class="panel p-10 text-center text-muted">Requires the Monitoring admin tier.</div>
    <div v-else class="space-y-6">
      <div class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Setting</th><th class="px-3 py-2">Environment variable</th><th class="px-3 py-2">Default / notes</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r[0]" class="border-t border-hull">
              <td class="px-3 py-2">{{ r[0] }}</td>
              <td class="px-3 py-2 font-mono text-xs">{{ r[1] }}</td>
              <td class="px-3 py-2 text-muted">{{ r[2] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="grid gap-4 sm:grid-cols-3">
        <NuxtLink to="/monitoring/alerts/rules" class="panel p-4 hover:ring-1 hover:ring-primary/40"><h3 class="font-semibold">Alert rules</h3><p class="text-sm text-muted">Rule conditions, delays, scoping</p></NuxtLink>
        <NuxtLink to="/monitoring/alerts/transports" class="panel p-4 hover:ring-1 hover:ring-primary/40"><h3 class="font-semibold">Transports</h3><p class="text-sm text-muted">Delivery channels + test</p></NuxtLink>
        <NuxtLink to="/monitoring/pollers" class="panel p-4 hover:ring-1 hover:ring-primary/40"><h3 class="font-semibold">Pollers</h3><p class="text-sm text-muted">Nodes, queue, dead-letter</p></NuxtLink>
      </div>
    </div>
  </div>
</template>
