<script setup lang="ts">
const { hasApp } = useAuth()

const { data: reports, status, refresh } = useAsyncData('netReports', () => $fetch('/api/net/reports'))

const reportTypes = [
  { value: 'availability', label: 'Availability Summary', icon: 'i-lucide-activity', desc: 'Up/down split and unavailable devices.' },
  { value: 'traffic', label: 'Traffic Summary', icon: 'i-lucide-arrow-left-right', desc: 'Top talkers by transferred bytes.' },
  { value: 'sensor-health', label: 'Sensor Health', icon: 'i-lucide-gauge', desc: 'OK / warning / critical sensor counts.' },
  { value: 'inventory', label: 'Device Inventory', icon: 'i-lucide-boxes', desc: 'Devices grouped by vendor and category.' }
]

const periods = [
  { value: 'last-24h', label: 'Last 24 hours' },
  { value: 'last-7d', label: 'Last 7 days' },
  { value: 'last-30d', label: 'Last 30 days' }
]

const selectedType = ref('availability')
const period = ref('last-30d')
const generating = ref(false)
const selected = ref<any>(null)

watchEffect(() => {
  if (!selected.value && reports.value?.length) selected.value = reports.value[0]
})

async function generate() {
  if (generating.value) return
  generating.value = true
  try {
    const r = await $fetch('/api/net/reports', { method: 'POST', body: { type: selectedType.value, period: period.value } })
    await refresh()
    selected.value = (reports.value || []).find((x: any) => x.id === r.id) || r
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Reports" subtitle="Scheduled and on-demand operational reports" icon="i-lucide-file-text" />

    <div v-if="!hasApp('net')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Net.</p>
    </div>

    <div v-else class="space-y-6">
      <!-- Generator -->
      <div class="panel p-5">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted) mb-4">Generate Report</h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            v-for="t in reportTypes" :key="t.value"
            class="flex flex-col gap-1.5 rounded-xl border p-4 text-left transition"
            :class="selectedType === t.value ? 'border-beacon/50 bg-beacon/10' : 'border-surface hover:border-hull bg-surface-2'"
            @click="selectedType = t.value"
          >
            <UIcon :name="t.icon" class="size-5" :class="selectedType === t.value ? 'text-beacon' : 'text-faint'" />
            <span class="text-sm font-medium text-foam">{{ t.label }}</span>
            <span class="text-xs text-faint">{{ t.desc }}</span>
          </button>
        </div>
        <div class="mt-4 flex flex-wrap items-end gap-3">
          <UFormField label="Period">
            <USelect v-model="period" :items="periods" value-key="value" label-key="label" class="w-48" />
          </UFormField>
          <UButton icon="i-lucide-play" :loading="generating" @click="generate">
            {{ generating ? 'Generating…' : 'Generate' }}
          </UButton>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <!-- Report list -->
        <div class="panel">
          <div class="px-4 py-3 border-b border-surface">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">Generated</h3>
          </div>
          <div v-if="status === 'pending' && !reports" class="p-6 text-center text-faint text-sm">Loading...</div>
          <div v-else-if="reports?.length === 0" class="p-6 text-center text-faint text-sm">No reports yet.</div>
          <ul v-else class="divide-y divide-surface max-h-[30rem] overflow-y-auto">
            <li v-for="r in reports" :key="r.id">
              <button
                class="w-full px-4 py-3 text-left transition hover:bg-surface-2/50"
                :class="selected?.id === r.id ? 'bg-surface-2' : ''"
                @click="selected = r"
              >
                <p class="text-sm font-medium text-foam truncate">{{ r.name }}</p>
                <p class="text-xs text-faint mt-0.5">{{ new Date(r.created_at).toLocaleString() }} · {{ r.period }}</p>
              </button>
            </li>
          </ul>
        </div>

        <!-- Report preview -->
        <div class="panel p-6">
          <div v-if="!selected" class="flex h-full items-center justify-center text-faint text-sm italic">
            Select or generate a report to preview it.
          </div>
          <div v-else>
            <div class="flex items-start justify-between border-b border-surface pb-4 mb-5">
              <div>
                <h3 class="font-display text-lg font-semibold text-foam">{{ selected.name }}</h3>
                <p class="text-xs text-faint mt-1">{{ new Date(selected.created_at).toLocaleString() }} · {{ selected.period }} · {{ selected.format?.toUpperCase() }}</p>
              </div>
              <UBadge size="sm" variant="soft" color="primary" class="capitalize">{{ selected.type }}</UBadge>
            </div>

            <div v-if="selected.summary?.headline?.length" class="grid gap-4 sm:grid-cols-3 mb-6">
              <div v-for="(h, i) in selected.summary.headline" :key="i" class="rounded-xl bg-surface-2 p-4">
                <div class="text-xs uppercase tracking-wider text-faint">{{ h.label }}</div>
                <div class="mt-1 text-2xl font-display font-semibold text-foam">{{ h.value }}</div>
              </div>
            </div>

            <div v-if="selected.summary?.rows?.length">
              <table class="w-full text-left text-sm text-(--color-muted)">
                <tbody class="divide-y divide-surface">
                  <tr v-for="(row, i) in selected.summary.rows" :key="i">
                    <td class="py-2 text-foam">{{ row.label }}</td>
                    <td class="py-2 text-right font-mono">{{ row.value }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p v-if="selected.summary?.note" class="mt-5 text-xs text-faint italic">{{ selected.summary.note }}</p>
            <p v-if="!selected.summary?.rows?.length && !selected.summary?.headline?.length" class="text-sm text-faint italic">
              No data captured for this report.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
