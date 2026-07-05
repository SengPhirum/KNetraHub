<script setup lang="ts">
const { hasApp } = useAuth()

const { data: alerts, status, refresh } = useAsyncData('netAlerts', () => $fetch('/api/net/alerts'), {
  server: false
})
const { data: rules } = useAsyncData('netAlertRules', () => $fetch('/api/net/rules'))

onMounted(() => {
  const interval = setInterval(refresh, 10000)
  onUnmounted(() => clearInterval(interval))
})

const conditionLabel = (r: any) => `${r.metric} ${r.condition} ${r.threshold}`

const acking = ref<string | null>(null)
async function toggleAck(alert: any) {
  acking.value = alert.id
  try {
    await $fetch(`/api/net/alerts/${alert.id}/ack`, { method: 'POST', body: { acknowledged: !alert.acknowledged_at } })
    await refresh()
  } finally {
    acking.value = null
  }
}
</script>

<template>
  <div>
    <PageHeader title="Alerts" subtitle="Active and historical alerting" icon="i-lucide-bell" />

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="space-y-6">
      <!-- Notification triggers / alert rules -->
      <div class="panel p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Notification Triggers</h2>
          <span class="text-xs text-faint inline-flex items-center gap-1">
            <UIcon name="i-lucide-info" class="size-3.5" /> Delivery channels are configured portal-wide
          </span>
        </div>
        <div v-if="!rules?.length" class="text-sm text-faint">No alert rules defined.</div>
        <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div v-for="rule in rules" :key="rule.id" class="rounded-xl border border-surface bg-surface-2 p-4">
            <div class="flex items-start justify-between gap-2">
              <span class="text-sm font-medium text-foam">{{ rule.name }}</span>
              <span class="size-2 rounded-full mt-1.5 shrink-0" :class="rule.enabled ? 'bg-green-500' : 'bg-faint'"></span>
            </div>
            <code class="mt-2 block text-xs font-mono text-(--color-muted)">{{ conditionLabel(rule) }}</code>
            <UBadge size="xs" variant="soft" class="mt-3 capitalize" :color="rule.severity === 'critical' ? 'error' : 'warning'">
              {{ rule.severity }}
            </UBadge>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="px-5 py-4 border-b border-surface">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Alert History</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-(--color-muted)">
            <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
              <tr>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium">Device</th>
                <th class="px-4 py-3 font-medium">Rule</th>
                <th class="px-4 py-3 font-medium">Message</th>
                <th class="px-4 py-3 font-medium">Timestamp</th>
                <th class="px-4 py-3 font-medium text-right">Acknowledge</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-if="status === 'pending' && !alerts" class="animate-pulse">
                <td colspan="6" class="px-4 py-8 text-center text-faint">Loading alerts...</td>
              </tr>
              <tr v-else-if="alerts?.length === 0">
                <td colspan="6" class="px-4 py-8 text-center text-faint">No alerts.</td>
              </tr>
              <tr v-for="alert in alerts" :key="alert.id" class="hover:bg-surface-2/50 transition">
                <td class="px-4 py-3">
                  <UBadge size="xs" variant="soft" :color="alert.status === 'active' ? (alert.severity === 'critical' ? 'error' : 'warning') : 'success'">
                    {{ alert.status }}
                  </UBadge>
                </td>
                <td class="px-4 py-3">
                  <NuxtLink :to="`/monitoring/network/devices/${alert.device_id}`" class="font-medium text-foam hover:text-beacon transition">{{ alert.device_name }}</NuxtLink>
                </td>
                <td class="px-4 py-3 text-foam">{{ alert.rule_name }}</td>
                <td class="px-4 py-3">{{ alert.message }}</td>
                <td class="px-4 py-3 text-xs">{{ new Date(alert.timestamp).toLocaleString() }}</td>
                <td class="px-4 py-3 text-right">
                  <div v-if="alert.acknowledged_at" class="flex flex-col items-end gap-1">
                    <UBadge size="xs" variant="subtle" color="info" icon="i-lucide-check-check">
                      Acknowledged{{ alert.acknowledged_by ? ` · ${alert.acknowledged_by}` : '' }}
                    </UBadge>
                    <UButton v-if="hasApp('monitoring')" size="xs" variant="ghost" color="neutral" :loading="acking === alert.id" @click="toggleAck(alert)">Un-acknowledge</UButton>
                  </div>
                  <UButton
                    v-else-if="hasApp('monitoring') && alert.status === 'active'"
                    size="xs" variant="soft" color="info" icon="i-lucide-check"
                    :loading="acking === alert.id" @click="toggleAck(alert)"
                  >Acknowledge</UButton>
                  <span v-else class="text-xs text-faint">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
