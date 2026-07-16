<script setup lang="ts">
// Active alerts with acknowledge action (operator tier).
const { hasMonitoring, canOperate } = useMonitoring()
const toast = useToast()
const stateFilter = ref('')

const url = computed(() => `/api/monitoring/v1/alerts${stateFilter.value ? '?state=' + stateFilter.value : ''}`)
const { data, status, refresh } = useAsyncData('monAlerts',
  () => $fetch<any>(url.value),
  { server: false, default: () => ({ items: [], total: 0 }), watch: [url] })

const ackTarget = ref<any>(null)
const ackNote = ref('')
const acking = ref(false)
async function confirmAck() {
  if (!ackTarget.value) return
  acking.value = true
  try {
    await $fetch(`/api/monitoring/v1/alerts/${ackTarget.value.id}/ack`, { method: 'POST', body: { note: ackNote.value } })
    toast.add({ title: 'Alert acknowledged', color: 'primary', icon: 'i-lucide-check' })
    ackTarget.value = null
    ackNote.value = ''
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Ack failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { acking.value = false }
}

const stateItems = [
  { value: '', label: 'Active' }, { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' }, { value: 'recovered', label: 'Recovered' }
]
</script>

<template>
  <div>
    <PageHeader title="Active Alerts" subtitle="Rule-driven incidents" icon="i-lucide-triangle-alert">
      <template #actions>
        <div class="flex gap-2">
          <NuxtLink to="/monitoring/alerts/rules"><UButton size="sm" variant="soft" icon="i-lucide-bell-ring">Rules</UButton></NuxtLink>
          <NuxtLink to="/monitoring/alerts/transports"><UButton size="sm" variant="soft" icon="i-lucide-send">Transports</UButton></NuxtLink>
        </div>
      </template>
    </PageHeader>

    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="space-y-4">
      <USelect v-model="stateFilter" :items="stateItems" size="sm" class="w-48" />
      <div class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Severity</th><th class="px-3 py-2">Device</th><th class="px-3 py-2">Rule</th>
              <th class="px-3 py-2">State</th><th class="px-3 py-2">Opened</th><th class="px-3 py-2" /></tr>
          </thead>
          <tbody>
            <tr v-if="status === 'pending'"><td colspan="6" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
            <tr v-else-if="!data?.items?.length"><td colspan="6" class="px-3 py-8 text-center text-muted">No alerts.</td></tr>
            <tr v-for="a in data.items" :key="a.id" class="border-t border-hull">
              <td class="px-3 py-2">
                <span :class="a.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'">{{ a.severity }}</span>
              </td>
              <td class="px-3 py-2">
                <NuxtLink :to="`/monitoring/devices/${a.device_id}`" class="text-primary hover:underline">{{ a.hostname || a.display_name || '—' }}</NuxtLink>
                <span v-if="a.entity_type !== 'device'" class="text-xs text-faint"> · {{ a.entity_type }} #{{ a.entity_id }}</span>
              </td>
              <td class="px-3 py-2 text-muted">{{ a.rule_name }}</td>
              <td class="px-3 py-2">
                {{ a.state }}
                <span v-if="a.suppressed_reason" class="text-xs text-faint"> ({{ a.suppressed_reason }})</span>
              </td>
              <td class="px-3 py-2 text-xs text-faint">{{ new Date(a.opened_at).toLocaleString() }}</td>
              <td class="px-3 py-2 text-right">
                <UButton v-if="canOperate && a.state === 'open'" size="xs" variant="soft" @click="ackTarget = a">Ack</UButton>
                <span v-else-if="a.acked_by" class="text-xs text-faint">by {{ a.acked_by }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal :open="!!ackTarget" title="Acknowledge alert" @update:open="(v) => !v && (ackTarget = null)">
      <template #body>
        <p class="mb-3 text-sm text-muted">Acknowledge <strong>{{ ackTarget?.rule_name }}</strong> on {{ ackTarget?.hostname }}?</p>
        <UFormField label="Note (optional)"><UTextarea v-model="ackNote" class="w-full" :rows="2" /></UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="ackTarget = null">Cancel</UButton>
          <UButton :loading="acking" @click="confirmAck">Acknowledge</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
