<script setup lang="ts">
const { hasApp } = useAuth()
const toast = useToast()

const { data: devices, status, refresh } = useAsyncData('netDevicesList', () => $fetch<any[]>('/api/net/devices'))
const { data: templates } = useAsyncData('netDeviceTemplates', () => $fetch<any[]>('/api/net/templates'), { default: () => [] as any[] })
const { data: groups } = useAsyncData('netGroupsForDeviceForm', () => $fetch<any[]>('/api/net/groups'), { default: () => [] as any[] })
const groupSelectItems = computed(() => [{ value: '', label: 'No group' }, ...(groups.value || []).map((g: any) => ({ value: g.id, label: g.name }))])

// --- Export / Import ---------------------------------------------------------
// SNMP passwords are never exported (see export.get.ts) - a re-imported device
// keeps its other fields but needs credentials re-entered under Settings.
const DEVICE_CSV_COLUMNS = ['hostname', 'ip', 'type', 'vendor', 'os', 'category', 'poll_method', 'snmp_version', 'snmp_community', 'snmp_sec_level', 'snmp_auth_user', 'snmp_priv_protocol']
async function exportDevices(format: 'json' | 'csv') {
  const rows = await $fetch<any[]>('/api/net/devices/export')
  if (format === 'json') downloadJson(exportFilename('devices', 'json'), rows)
  else downloadText(exportFilename('devices', 'csv'), toCsv(rows, DEVICE_CSV_COLUMNS), 'text/csv')
}
const importing = ref(false)
async function importDevices() {
  const file = await pickAndReadFile('.json,.csv')
  if (!file) return
  importing.value = true
  try {
    const format = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json'
    const result = await $fetch<{ added: number; skipped: number; errors: { row: number; message: string }[] }>('/api/net/devices/import', {
      method: 'POST',
      body: { format, content: file.text }
    })
    toast.add({
      title: `Imported ${result.added} device${result.added === 1 ? '' : 's'}`,
      description: result.skipped ? `${result.skipped} skipped (already exist)` : (result.errors[0]?.message ? `Row ${result.errors[0].row}: ${result.errors[0].message}` : undefined),
      color: result.added ? 'primary' : 'warning',
      icon: 'i-lucide-check'
    })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Import failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    importing.value = false
  }
}
const importExportMenu = [
  [
    { label: 'Export as JSON', icon: 'i-lucide-file-json', onSelect: () => exportDevices('json') },
    { label: 'Export as CSV', icon: 'i-lucide-file-spreadsheet', onSelect: () => exportDevices('csv') }
  ],
  [
    { label: 'Import…', icon: 'i-lucide-upload', onSelect: importDevices }
  ]
]

const search = ref('')
const categoryFilter = ref('all')

const filteredDevices = computed(() => {
  let list = devices.value || []
  if (categoryFilter.value !== 'all') {
    list = list.filter(d => d.category === categoryFilter.value)
  }
  if (search.value) {
    const s = search.value.toLowerCase()
    list = list.filter(d => d.hostname.toLowerCase().includes(s) || d.ip.includes(s))
  }
  return list
})

// Status pill styling shared by the table. paused = intentionally offline.
function statusDot(s: string) {
  return s === 'up' ? 'bg-emerald-500 shadow-emerald-500/50'
    : s === 'paused' ? 'bg-amber-500 shadow-amber-500/50'
    : s === 'down' ? 'bg-rose-500 shadow-rose-500/50'
    : 'bg-slate-500 shadow-slate-500/40'
}
function statusText(s: string) {
  return s === 'up' ? 'text-emerald-500'
    : s === 'paused' ? 'text-amber-500'
    : s === 'down' ? 'text-rose-500'
    : 'text-faint'
}

const isAddModalOpen = ref(false)
function blankDevice() {
  return {
    hostname: '',
    ip: '',
    poll_method: 'snmp',
    snmp_version: 'v2c',
    snmp_community: 'public',
    category: 'network',
    type: 'Unknown',
    group_id: '',
    ...defaultSnmpV3()
  }
}
const newDevice = ref(blankDevice())
const selectedTemplate = ref<string>('')

const templateItems = computed(() => [
  { value: '', label: 'Start from scratch' },
  ...(templates.value || []).map((t) => ({ value: t.id, label: t.name }))
])

// Applying a template fills in monitoring defaults but never the hostname/IP.
function applyTemplate(id: string) {
  selectedTemplate.value = id
  const t = (templates.value || []).find((x) => x.id === id)
  if (!t) return
  const { hostname, ip, type, group_id } = newDevice.value
  newDevice.value = {
    hostname,
    ip,
    type,
    group_id,
    poll_method: t.poll_method || 'snmp',
    snmp_version: t.snmp_version || 'v2c',
    snmp_community: t.snmp_community || 'public',
    category: t.category || 'network',
    snmp_sec_level: t.snmp_sec_level || defaultSnmpV3().snmp_sec_level,
    snmp_auth_user: t.snmp_auth_user || '',
    snmp_auth_protocol: t.snmp_auth_protocol || defaultSnmpV3().snmp_auth_protocol,
    snmp_auth_password: t.snmp_auth_password || '',
    snmp_priv_protocol: t.snmp_priv_protocol || defaultSnmpV3().snmp_priv_protocol,
    snmp_priv_password: t.snmp_priv_password || ''
  }
}

function openAdd() {
  newDevice.value = blankDevice()
  selectedTemplate.value = ''
  isAddModalOpen.value = true
}

const adding = ref(false)
async function addDevice() {
  if (!newDevice.value.hostname.trim() || !newDevice.value.ip.trim()) return
  adding.value = true
  try {
    await $fetch('/api/net/devices', { method: 'POST', body: newDevice.value })
    isAddModalOpen.value = false
    await refresh()
  } finally {
    adding.value = false
  }
}

// Pause / resume monitoring inline from the list.
const togglingId = ref<string | null>(null)
async function toggleMonitoring(dev: any) {
  togglingId.value = dev.id
  try {
    await $fetch(`/api/net/devices/${dev.id}/monitoring`, {
      method: 'POST',
      body: { enabled: dev.monitoring_enabled === false }
    })
    await refresh()
  } finally {
    togglingId.value = null
  }
}

const deleteTarget = ref<any>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await $fetch(`/api/net/devices/${deleteTarget.value.id}`, { method: 'DELETE' })
    deleteTarget.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Devices" subtitle="Comprehensive inventory and status of all monitored assets" icon="i-lucide-server-crash">
      <template v-if="hasApp('monitoring')" #actions>
        <div class="flex items-center gap-2">
          <UDropdownMenu :items="importExportMenu" :content="{ align: 'end' }">
            <UButton icon="i-lucide-import" color="neutral" variant="soft" size="sm" :loading="importing">Import / Export</UButton>
          </UDropdownMenu>
          <UButton icon="i-lucide-plus" size="sm" @click="openAdd">Add Device</UButton>
        </div>
      </template>
    </PageHeader>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="space-y-4">
      <div class="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search hostname or IP..." class="w-full sm:w-64" />
          <USelect v-model="categoryFilter" :items="CATEGORY_FILTER_ITEMS" value-key="value" label-key="label" />
        </div>
      </div>

      <div class="panel">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-(--color-muted)">
            <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
              <tr>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium">Device</th>
                <th class="px-4 py-3 font-medium">Category</th>
                <th class="px-4 py-3 font-medium">Platform</th>
                <th class="px-4 py-3 font-medium">Uptime</th>
                <th class="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-if="status === 'pending'" class="animate-pulse">
                <td colspan="6" class="px-4 py-8 text-center text-faint">Loading devices...</td>
              </tr>
              <tr v-else-if="filteredDevices.length === 0">
                <td colspan="6" class="px-4 py-8 text-center text-faint">No devices found.</td>
              </tr>
              <tr v-for="dev in filteredDevices" :key="dev.id" class="hover:bg-surface-2/50 transition">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <span class="size-2.5 rounded-full shadow-sm" :class="statusDot(dev.status)"></span>
                    <span class="capitalize text-xs font-medium" :class="statusText(dev.status)">{{ dev.status || 'unknown' }}</span>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <NuxtLink :to="`/monitoring/network/devices/${dev.id}`" class="font-medium text-foam hover:text-beacon transition">{{ dev.hostname }}</NuxtLink>
                  <div class="font-mono text-xs text-faint mt-0.5">{{ dev.ip }}</div>
                </td>
                <td class="px-4 py-3">
                  <UBadge size="xs" variant="soft" :color="categoryColor(dev.category)">
                    {{ categoryLabel(dev.category) }}
                  </UBadge>
                </td>
                <td class="px-4 py-3">
                  <div class="text-foam">{{ dev.os || 'Unknown' }}</div>
                  <div class="text-xs text-faint">{{ dev.vendor || 'Unknown' }} ({{ dev.poll_method }})</div>
                </td>
                <td class="px-4 py-3 text-xs">{{ dev.uptime }}</td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <UButton
                      v-if="hasApp('monitoring')"
                      size="xs"
                      variant="ghost"
                      :color="dev.monitoring_enabled === false ? 'success' : 'neutral'"
                      :icon="dev.monitoring_enabled === false ? 'i-lucide-play' : 'i-lucide-pause'"
                      :loading="togglingId === dev.id"
                      :aria-label="dev.monitoring_enabled === false ? 'Resume monitoring' : 'Pause monitoring'"
                      @click="toggleMonitoring(dev)"
                    />
                    <UButton v-if="hasApp('monitoring')" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete device" @click="deleteTarget = dev" />
                    <UButton :to="`/monitoring/network/devices/${dev.id}`" size="xs" variant="ghost" icon="i-lucide-chevron-right" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Add Device Modal -->
    <UModal v-model:open="isAddModalOpen" title="Add Device">
      <template #body>
        <div class="space-y-4">
          <UFormField v-if="templates?.length" label="Template" help="Prefill monitoring settings from a saved template.">
            <USelect :model-value="selectedTemplate" :items="templateItems" value-key="value" label-key="label" class="w-full" @update:model-value="applyTemplate" />
          </UFormField>
          <UFormField label="Hostname">
            <UInput v-model="newDevice.hostname" placeholder="sw-core-01" class="w-full" />
          </UFormField>
          <UFormField label="IP Address">
            <UInput v-model="newDevice.ip" placeholder="10.0.0.1" class="w-full" />
          </UFormField>
          <UFormField label="Category">
            <USelect v-model="newDevice.category" :items="CATEGORY_SELECT_ITEMS" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Device Type">
            <USelect v-model="newDevice.type" :items="DEVICE_TYPE_SELECT_ITEMS" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Group">
            <USelect v-model="newDevice.group_id" :items="groupSelectItems" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Polling Method">
            <USelect v-model="newDevice.poll_method" :items="[{value:'snmp', label:'SNMP'}, {value:'ping', label:'Ping Only'}]" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <template v-if="newDevice.poll_method === 'snmp'">
            <NetSnmpFields :form="newDevice" />
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 w-full">
          <UButton variant="ghost" @click="isAddModalOpen = false">Cancel</UButton>
          <UButton color="primary" :loading="adding" :disabled="!newDevice.hostname.trim() || !newDevice.ip.trim()" @click="addDevice">Add Device</UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete confirmation -->
    <UModal :open="!!deleteTarget" @update:open="(v) => { if (!v) deleteTarget = null }">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-foam mb-2">Delete device</h3>
          <p class="text-sm text-(--color-muted)">
            Remove <span class="font-medium text-foam">{{ deleteTarget?.hostname }}</span>
            (<span class="font-mono">{{ deleteTarget?.ip }}</span>) and all of its interfaces, sensors, and alerts?
            This cannot be undone.
          </p>
          <div class="mt-6 flex justify-end gap-3">
            <UButton variant="ghost" @click="deleteTarget = null">Cancel</UButton>
            <UButton color="error" :loading="deleting" @click="confirmDelete">Delete</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
