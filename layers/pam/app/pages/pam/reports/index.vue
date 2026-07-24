<script setup lang="ts">
// Reports — preview a report, generate it SERVER-SIDE (CSV/XLSX/PDF/JSON, stored
// as an evidence snapshot with a checksum), schedule recurring delivery, and
// re-download prior runs byte-for-byte.
const toast = useToast()
const { canManageReports, canExportReports, statusBadge, shortTime } = usePam()
const { data: reports, status } = useAsyncData('pamReports',
  () => $fetch<any[]>('/api/pam/v1/reports'), { server: false, default: () => [] })
const { data: schedules, refresh: refreshSchedules } = useAsyncData('pamReportSchedules',
  () => $fetch<any[]>('/api/pam/v1/reports/schedules'), { server: false, default: () => [] })
const { data: runs, refresh: refreshRuns } = useAsyncData('pamReportRuns',
  () => $fetch<any[]>('/api/pam/v1/reports/runs?limit=25'), { server: false, default: () => [] })

const FORMATS = ['csv', 'xlsx', 'pdf', 'json']
const active = ref<any>(null)
const loading = ref(false)
async function run(key: string) {
  loading.value = true
  try { active.value = await $fetch(`/api/pam/v1/reports/${key}`) }
  catch (e: any) { toast.add({ title: 'Could not run report', description: e?.data?.statusMessage, color: 'error' }) }
  finally { loading.value = false }
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
}
const generating = ref('')
async function serverGenerate(format: string) {
  if (!active.value) return
  generating.value = format
  try {
    const blob = await $fetch<Blob>(`/api/pam/v1/reports/${active.value.key}/generate`, { method: 'POST', body: { format }, responseType: 'blob' })
    downloadBlob(blob, `${active.value.key}.${format}`)
    await refreshRuns()
  } catch (e: any) { toast.add({ title: 'Generation failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { generating.value = '' }
}
async function downloadRun(r: any) {
  try {
    const blob = await $fetch<Blob>(`/api/pam/v1/reports/runs/${r.id}/download`, { responseType: 'blob' })
    downloadBlob(blob, `${r.report_key}.${r.format}`)
  } catch (e: any) { toast.add({ title: 'Download failed', description: e?.data?.statusMessage, color: 'error' }) }
}

// Schedules
const INTERVALS = [
  { label: 'Hourly', value: 3600 },
  { label: 'Daily', value: 86400 },
  { label: 'Weekly', value: 604800 },
  { label: 'Monthly', value: 2592000 }
]
const showSched = ref(false)
const savingSched = ref(false)
const sform = reactive({ report_key: '', format: 'xlsx', interval_seconds: 604800, channel: 'notification' })
async function createSchedule() {
  savingSched.value = true
  try {
    await $fetch('/api/pam/v1/reports/schedules', { method: 'POST', body: { ...sform } })
    toast.add({ title: 'Schedule created', color: 'success' })
    showSched.value = false
    await refreshSchedules()
  } catch (e: any) { toast.add({ title: 'Could not schedule', description: e?.data?.statusMessage, color: 'error' }) }
  finally { savingSched.value = false }
}
async function toggleSchedule(s: any, enabled: boolean) {
  try { await $fetch(`/api/pam/v1/reports/schedules/${s.id}`, { method: 'PUT', body: { enabled } }); s.enabled = enabled }
  catch (e: any) { toast.add({ title: 'Could not update', description: e?.data?.statusMessage, color: 'error' }); await refreshSchedules() }
}
async function deleteSchedule(s: any) {
  try { await $fetch(`/api/pam/v1/reports/schedules/${s.id}`, { method: 'DELETE' }); await refreshSchedules() }
  catch (e: any) { toast.add({ title: 'Could not delete', description: e?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div class="space-y-4">
    <PageHeader title="Reports" subtitle="Inventory, compliance and access reports — with scheduled evidence delivery" icon="i-lucide-file-bar-chart">
      <template v-if="canManageReports" #actions><UButton size="sm" icon="i-lucide-calendar-clock" @click="showSched = true">New schedule</UButton></template>
    </PageHeader>

    <div class="grid gap-4 lg:grid-cols-4">
      <section class="panel p-4 lg:col-span-1">
        <h2 class="mb-2 text-xs font-semibold uppercase text-faint">Reports</h2>
        <DataState :status="status">
          <ul class="space-y-1">
            <li v-for="r in reports" :key="r.key">
              <button class="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2" :class="active?.key === r.key ? 'bg-surface-2 text-beacon' : 'text-(--color-muted)'" @click="run(r.key)">{{ r.title }}</button>
            </li>
          </ul>
        </DataState>
      </section>
      <section class="panel p-4 lg:col-span-3">
        <div v-if="!active" class="py-12 text-center text-sm text-faint">Select a report to preview and generate.</div>
        <div v-else>
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-display font-semibold text-foam">{{ active.title }} <span class="text-xs text-faint">({{ active.rows.length }} rows)</span></h2>
            <div v-if="canExportReports" class="flex flex-wrap gap-1.5">
              <UButton v-for="f in FORMATS" :key="f" size="xs" variant="soft" :loading="generating===f" icon="i-lucide-download" @click="serverGenerate(f)">{{ f.toUpperCase() }}</UButton>
            </div>
          </div>
          <div class="max-h-[50vh] overflow-auto">
            <table class="w-full text-left text-xs">
              <thead class="sticky top-0 bg-surface text-faint"><tr><th v-for="c in active.columns" :key="c" class="px-2 py-1.5 uppercase">{{ c }}</th></tr></thead>
              <tbody class="divide-y divide-surface">
                <tr v-for="(row, i) in active.rows" :key="i" class="hover:bg-surface-2/40">
                  <td v-for="c in active.columns" :key="c" class="px-2 py-1 text-(--color-muted)">{{ row[c] ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <section class="panel p-4">
        <h2 class="mb-2 text-xs font-semibold uppercase text-faint">Scheduled deliveries</h2>
        <div v-if="!schedules?.length" class="py-6 text-center text-sm text-faint">No schedules.</div>
        <table v-else class="w-full text-left text-sm">
          <tbody class="divide-y divide-surface">
            <tr v-for="s in schedules" :key="s.id" class="hover:bg-surface-2/40">
              <td class="py-2"><span class="text-foam">{{ s.report_key }}</span><span class="block text-xs text-faint">{{ s.format?.toUpperCase() }} · every {{ Math.round(s.interval_seconds/3600) }}h · {{ s.channel }}</span></td>
              <td class="py-2 text-xs text-faint">next {{ shortTime(s.next_run_at) }}</td>
              <td class="py-2 text-right">
                <div class="flex items-center justify-end gap-2">
                  <USwitch :model-value="s.enabled" :disabled="!canManageReports" @update:model-value="(v:boolean)=>toggleSchedule(s,v)" />
                  <UButton v-if="canManageReports" size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click="deleteSchedule(s)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="panel p-4">
        <h2 class="mb-2 text-xs font-semibold uppercase text-faint">Recent generated runs (evidence)</h2>
        <div v-if="!runs?.length" class="py-6 text-center text-sm text-faint">No runs yet.</div>
        <table v-else class="w-full text-left text-sm">
          <tbody class="divide-y divide-surface">
            <tr v-for="r in runs" :key="r.id" class="hover:bg-surface-2/40">
              <td class="py-2"><span class="text-foam">{{ r.report_key }}</span><span class="block text-xs text-faint">{{ r.format?.toUpperCase() }} · {{ r.row_count }} rows · {{ shortTime(r.generated_at) }}</span></td>
              <td class="py-2"><span v-if="r.delivery_status" class="rounded px-1.5 py-0.5 text-xs" :class="statusBadge(r.delivery_status==='delivered'?'active':r.delivery_status)">{{ r.delivery_status }}</span></td>
              <td class="py-2 text-right"><UButton v-if="canExportReports" size="xs" variant="ghost" icon="i-lucide-download" @click="downloadRun(r)">Download</UButton></td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <UModal v-model:open="showSched" title="Schedule a report">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Report" required><USelect v-model="sform.report_key" class="w-full" :items="(reports||[]).map(r=>({label:r.title,value:r.key}))" /></UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Format"><USelect v-model="sform.format" class="w-full" :items="FORMATS" /></UFormField>
            <UFormField label="Interval"><USelect v-model="sform.interval_seconds" class="w-full" :items="INTERVALS" /></UFormField>
          </div>
          <UFormField label="Delivery channel" hint="notification is live; email/webhook need external transport">
            <USelect v-model="sform.channel" class="w-full" :items="['notification','email','webhook']" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showSched = false">Cancel</UButton>
          <UButton :loading="savingSched" :disabled="!sform.report_key" @click="createSchedule">Create schedule</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
