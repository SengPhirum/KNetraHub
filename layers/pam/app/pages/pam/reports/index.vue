<script setup lang="ts">
// Reports — server-rendered PAM reports with CSV/JSON export.
const toast = useToast()
const { data: reports, status } = useAsyncData('pamReports',
  () => $fetch<any[]>('/api/pam/v1/reports'), { server: false, default: () => [] })

const active = ref<any>(null)
const loading = ref(false)
async function run(key: string) {
  loading.value = true
  try { active.value = await $fetch(`/api/pam/v1/reports/${key}`) }
  catch (e: any) { toast.add({ title: 'Could not run report', description: e?.data?.statusMessage, color: 'error' }) }
  finally { loading.value = false }
}
function exportCsv() {
  if (!active.value) return
  const cols = active.value.columns
  const lines = [cols.join(',')]
  for (const r of active.value.rows) lines.push(cols.map((c: string) => JSON.stringify(r[c] ?? '')).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `pam-${active.value.key}.csv`; a.click(); URL.revokeObjectURL(url)
}
function exportJson() {
  if (!active.value) return
  const blob = new Blob([JSON.stringify(active.value.rows, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `pam-${active.value.key}.json`; a.click(); URL.revokeObjectURL(url)
}
</script>

<template>
  <div>
    <PageHeader title="Reports" subtitle="Inventory, compliance and access reports" icon="i-lucide-file-bar-chart" />
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
        <div v-if="!active" class="py-12 text-center text-sm text-faint">Select a report.</div>
        <div v-else>
          <div class="mb-3 flex items-center justify-between">
            <h2 class="font-display font-semibold text-foam">{{ active.title }} <span class="text-xs text-faint">({{ active.rows.length }} rows)</span></h2>
            <div class="flex gap-2">
              <UButton size="xs" variant="soft" icon="i-lucide-download" @click="exportCsv">CSV</UButton>
              <UButton size="xs" variant="soft" icon="i-lucide-braces" @click="exportJson">JSON</UButton>
            </div>
          </div>
          <div class="max-h-[60vh] overflow-auto">
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
  </div>
</template>
