<script setup lang="ts">
// Alert transports list with a Test action (operator tier). Secrets are never
// returned; only whether a config is set.
const { hasMonitoring, canOperate } = useMonitoring()
const toast = useToast()
const { data, status } = useAsyncData('monTransports',
  () => $fetch<any>('/api/monitoring/v1/alerts/transports'),
  { server: false, default: () => ({ items: [] }) })
const testing = ref<number | null>(null)
async function test(id: number) {
  testing.value = id
  try {
    const res = await $fetch<any>(`/api/monitoring/v1/alerts/transports/${id}/test`, { method: 'POST' })
    toast.add({ title: res.ok ? 'Test sent' : 'Test failed', description: res.error, color: res.ok ? 'primary' : 'error', icon: res.ok ? 'i-lucide-check' : 'i-lucide-x' })
  } catch (e: any) {
    toast.add({ title: 'Test failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { testing.value = null }
}
</script>

<template>
  <div>
    <PageHeader title="Alert Transports" subtitle="Notification delivery channels" icon="i-lucide-send" />
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="panel overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
          <tr><th class="px-3 py-2">Name</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Enabled</th>
            <th class="px-3 py-2">Default</th><th class="px-3 py-2 text-right" /></tr>
        </thead>
        <tbody>
          <tr v-if="status === 'pending'"><td colspan="5" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
          <tr v-else-if="!data.items.length"><td colspan="5" class="px-3 py-8 text-center text-muted">No transports configured.</td></tr>
          <tr v-for="t in data.items" :key="t.id" class="border-t border-hull">
            <td class="px-3 py-2">{{ t.name }}</td>
            <td class="px-3 py-2 text-muted">{{ t.type }}</td>
            <td class="px-3 py-2">{{ t.enabled ? 'Yes' : 'No' }}</td>
            <td class="px-3 py-2">{{ t.is_default ? 'Yes' : '—' }}</td>
            <td class="px-3 py-2 text-right">
              <UButton v-if="canOperate" size="xs" variant="soft" :loading="testing === t.id" @click="test(t.id)">Test</UButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
