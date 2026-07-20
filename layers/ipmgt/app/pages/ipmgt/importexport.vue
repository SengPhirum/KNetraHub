<script setup lang="ts">
// Bulk import/export for the major IPAM entities. Export downloads JSON or
// CSV; import accepts a previously exported file back (or a hand-built one
// using the same columns) and reports created/updated/skipped/errors per row.
const { hasApp, hasPermission } = useAuth()
const canExport = computed(() => hasPermission('ipmgt.export'))
const canImport = computed(() => hasPermission('ipmgt.import'))
const toast = useToast()

const ENTITY_ITEMS = [
  { value: 'section', label: 'Sections' },
  { value: 'subnet', label: 'Subnets' },
  { value: 'address', label: 'IP Addresses' },
  { value: 'vlan', label: 'VLANs' },
  { value: 'vrf', label: 'VRFs' },
  { value: 'device', label: 'Devices' },
  { value: 'location', label: 'Locations' },
  { value: 'customer', label: 'Customers' }
]
const entityType = ref('subnet')
const exporting = ref(false)

// Optional sub-entity scope: restrict an export to the rows belonging to one
// parent record (e.g. only one section's subnets, or one subnet's addresses).
// Each scopeable entity maps to the parent it's filtered by and the endpoint
// that lists those parents. Entities absent here export everything, unscoped.
const SCOPE_CONFIG: Record<string, { label: string; endpoint: string; format: (r: any) => string }> = {
  subnet:  { label: 'Section',   endpoint: '/api/ipmgt/sections',  format: (r) => r.name },
  address: { label: 'Subnet',    endpoint: '/api/ipmgt/subnets',   format: (r) => (r.name ? `${r.network} — ${r.name}` : r.network) },
  vlan:    { label: 'L2 domain', endpoint: '/api/ipmgt/l2domains', format: (r) => r.name },
  vrf:     { label: 'Location',  endpoint: '/api/ipmgt/locations', format: (r) => r.name },
  device:  { label: 'Location',  endpoint: '/api/ipmgt/locations', format: (r) => r.name }
}
const scopeConfig = computed(() => SCOPE_CONFIG[entityType.value] || null)
const scopeId = ref('')
const scopeItems = ref<{ value: string; label: string }[]>([])
const loadingScope = ref(false)

async function loadScopeOptions() {
  scopeId.value = ''
  const cfg = scopeConfig.value
  if (!cfg || !canExport.value) { scopeItems.value = []; return }
  loadingScope.value = true
  try {
    const rows = await $fetch<any[]>(cfg.endpoint)
    scopeItems.value = [
      { value: '', label: `All ${cfg.label.toLowerCase()}s` },
      ...rows.map((r) => ({ value: r.id as string, label: cfg.format(r) }))
    ]
  } catch {
    scopeItems.value = [{ value: '', label: `All ${cfg.label.toLowerCase()}s` }]
  } finally {
    loadingScope.value = false
  }
}
watch(entityType, loadScopeOptions)
onMounted(loadScopeOptions)

async function doExport(format: 'json' | 'csv') {
  exporting.value = true
  try {
    const query: Record<string, string> = { entity_type: entityType.value }
    if (scopeConfig.value && scopeId.value) query.scope_id = scopeId.value
    const rows = await $fetch<any[]>('/api/ipmgt/export', { query })
    const base = `ipmgt-${entityType.value}`
    if (format === 'json') {
      downloadJson(exportFilename(base, 'json'), rows)
    } else {
      const columns = rows.length ? Object.keys(rows[0]) : []
      downloadText(exportFilename(base, 'csv'), toCsv(sanitizeRowsForCsv(rows), columns), 'text/csv')
    }
    toast.add({ title: `Exported ${rows.length} ${entityType.value} row(s)`, color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Export failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { exporting.value = false }
}

const IMPORT_MODE_ITEMS = [
  { value: 'skip', label: 'Skip existing' },
  { value: 'update', label: 'Update existing' }
]
const importMode = ref<'skip' | 'update'>('skip')
const importing = ref(false)
const importFile = ref<{ name: string; text: string } | null>(null)
const importReport = ref<{ created: number; updated: number; skipped: number; errors: { row: number; message: string }[] } | null>(null)

async function pickFile() {
  const file = await pickAndReadFile('.json,.csv')
  importFile.value = file
  importReport.value = null
}

async function doImport() {
  if (!importFile.value) return
  importing.value = true
  try {
    const format = importFile.value.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json'
    const report = await $fetch<any>('/api/ipmgt/import', {
      method: 'POST',
      body: { entity_type: entityType.value, format, content: importFile.value.text, mode: importMode.value }
    })
    importReport.value = report
    toast.add({ title: `Import finished: ${report.created} created, ${report.updated} updated, ${report.skipped} skipped`, color: report.errors.length ? 'warning' : 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Import failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { importing.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="Import / Export" subtitle="Bulk-load or download IPAM data as JSON or CSV" icon="i-lucide-arrow-left-right" />

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <div v-else class="space-y-6">
      <UFormField label="Entity type" class="max-w-xs">
        <USelect v-model="entityType" :items="ENTITY_ITEMS" value-key="value" label-key="label" class="w-full" />
      </UFormField>

      <section v-if="canExport" class="panel space-y-3 p-5">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Export</h2>
        <p class="text-sm text-(--color-muted)">
          Download {{ scopeConfig && scopeId ? 'the selected' : 'every' }} {{ entityType }} row. Device exports never include SNMP credentials.
        </p>
        <UFormField
          v-if="scopeConfig"
          :label="`Limit to ${scopeConfig.label.toLowerCase()}`"
          class="max-w-xs"
          :description="`Optional — export only the ${entityType}s under one ${scopeConfig.label.toLowerCase()}.`"
        >
          <USelect
            v-model="scopeId"
            :items="scopeItems"
            value-key="value"
            label-key="label"
            :loading="loadingScope"
            class="w-full"
          />
        </UFormField>
        <div class="flex gap-2">
          <UButton icon="i-lucide-file-json" variant="soft" :loading="exporting" @click="doExport('json')">Export JSON</UButton>
          <UButton icon="i-lucide-file-spreadsheet" variant="soft" :loading="exporting" @click="doExport('csv')">Export CSV</UButton>
        </div>
      </section>

      <section v-if="canImport" class="panel space-y-3 p-5">
        <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Import</h2>
        <p class="text-sm text-(--color-muted)">Upload a file using the same columns as the export above. Reference fields (section/VRF/location/customer/device) are matched by name.</p>
        <div class="flex flex-wrap items-center gap-3">
          <UButton icon="i-lucide-upload" variant="soft" @click="pickFile">{{ importFile ? importFile.name : 'Choose file' }}</UButton>
          <USelect v-model="importMode" :items="IMPORT_MODE_ITEMS" value-key="value" label-key="label" size="sm" class="w-44" />
          <UButton color="primary" :loading="importing" :disabled="!importFile" @click="doImport">Import</UButton>
        </div>

        <div v-if="importReport" class="space-y-2 rounded-lg bg-surface-2/40 p-3 text-sm">
          <p>
            <span class="text-emerald-400">{{ importReport.created }} created</span> ·
            <span class="text-sky-400">{{ importReport.updated }} updated</span> ·
            <span class="text-faint">{{ importReport.skipped }} skipped</span> ·
            <span :class="importReport.errors.length ? 'text-rose-400' : 'text-faint'">{{ importReport.errors.length }} error(s)</span>
          </p>
          <ul v-if="importReport.errors.length" class="max-h-48 space-y-1 overflow-y-auto font-mono text-xs text-rose-400">
            <li v-for="err in importReport.errors" :key="err.row">Row {{ err.row }}: {{ err.message }}</li>
          </ul>
        </div>
      </section>
    </div>
  </div>
</template>
