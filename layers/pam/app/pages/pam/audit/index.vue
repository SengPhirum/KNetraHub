<script setup lang="ts">
// Audit integrity — the tamper-evident PAM audit trail + chain verification.
const toast = useToast()
const { severityMeta, shortTime } = usePam()
const { data, status, error, refresh } = useAsyncData('pamAudit',
  () => $fetch<any>('/api/pam/v1/audit'), { server: false, default: () => ({ events: [], checkpoints: [] }) })

const verifying = ref(false)
const report = ref<any>(null)
async function verify() {
  verifying.value = true
  try {
    report.value = await $fetch('/api/pam/v1/audit/verify', { method: 'POST', body: { checkpoint: true } })
    toast.add({ title: report.value.ok ? 'Audit chain verified' : 'Integrity failure detected', color: report.value.ok ? 'success' : 'error' })
    await refresh()
  } catch (e: any) { toast.add({ title: 'Verification error', description: e?.data?.statusMessage, color: 'error' }) }
  finally { verifying.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="Audit integrity" subtitle="Tamper-evident, hash-chained PAM audit trail" icon="i-lucide-fingerprint">
      <template #actions><UButton :loading="verifying" icon="i-lucide-shield-check" size="sm" @click="verify">Verify chain</UButton></template>
    </PageHeader>

    <UAlert v-if="report" :color="report.ok ? 'success' : 'error'" variant="soft" class="mb-4"
      :icon="report.ok ? 'i-lucide-shield-check' : 'i-lucide-shield-x'"
      :title="report.ok ? 'Chain intact' : 'Integrity failure'"
      :description="`${report.totalEvents} events · ${report.checkpointsChecked} checkpoints (${report.checkpointsFailed} failed)${report.brokenAt ? ' · broken at ' + report.brokenAt.slice(0,8) : ''}`" />

    <DataState :status="status" :error="error" :empty="!data.events.length" empty-label="No audit events yet.">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">#</th><th class="px-3 py-2">When</th><th class="px-3 py-2">Actor</th><th class="px-3 py-2">Action</th><th class="px-3 py-2">Object</th><th class="px-3 py-2">Result</th><th class="px-3 py-2">Hash</th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="e in data.events" :key="e.id" class="hover:bg-surface-2/40">
              <td class="px-3 py-1.5 text-faint">{{ e.seq }}</td>
              <td class="px-3 py-1.5 text-faint">{{ shortTime(e.ts) }}</td>
              <td class="px-3 py-1.5 text-(--color-muted)">{{ e.actor }}</td>
              <td class="px-3 py-1.5 font-mono text-foam">{{ e.action }}</td>
              <td class="px-3 py-1.5 text-faint">{{ e.object_type }}{{ e.object_id ? ' ' + e.object_id.slice(0,8) : '' }}</td>
              <td class="px-3 py-1.5"><span class="rounded px-1.5 py-0.5" :class="severityMeta(e.severity).badge">{{ e.result }}</span></td>
              <td class="px-3 py-1.5 font-mono text-faint">{{ (e.hash || '').slice(0,10) }}…</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>
  </div>
</template>
