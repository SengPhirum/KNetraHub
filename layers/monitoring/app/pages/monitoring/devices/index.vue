<script setup lang="ts">
// Device inventory: filter by status/type/OS/text, add device, open detail.
import { DEVICE_TYPES } from '../../../../shared/constants'

const { hasMonitoring, canManage, deviceStatusMeta, deviceTypeMeta, formatUptime } = useMonitoring()
const route = useRoute()
const toast = useToast()

const filters = reactive({
  status: (route.query.status as string) || 'all',
  device_type: (route.query.device_type as string) || 'all',
  os: '',
  q: ''
})
const page = ref(1)

const query = computed(() => {
  const p = new URLSearchParams()
  if (filters.status && filters.status !== 'all') p.set('status', filters.status)
  if (filters.device_type && filters.device_type !== 'all') p.set('device_type', filters.device_type)
  if (filters.os) p.set('os', filters.os)
  if (filters.q) p.set('q', filters.q)
  p.set('page', String(page.value))
  p.set('per_page', '50')
  return p.toString()
})

const { data, status, refresh } = useAsyncData('monDevices',
  () => $fetch<any>(`/api/monitoring/v1/devices?${query.value}`),
  { server: false, default: () => ({ items: [], total: 0 }), watch: [query] })

const selected = ref<Set<number>>(new Set())
watch(query, () => { selected.value = new Set() })
const allOnPageSelected = computed(() => !!data.value?.items?.length && data.value.items.every((d: any) => selected.value.has(d.id)))
function toggleAllOnPage() {
  const next = new Set(selected.value)
  if (allOnPageSelected.value) {
    for (const d of data.value.items) next.delete(d.id)
  } else {
    for (const d of data.value.items) next.add(d.id)
  }
  selected.value = next
}
function toggleOne(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  selected.value = next
}

const bulkRunning = ref(false)
async function runBulk(action: string) {
  bulkRunning.value = true
  try {
    const res = await $fetch<any>('/api/monitoring/v1/devices/bulk', {
      method: 'POST', body: { ids: [...selected.value], action }
    })
    toast.add({ title: `${action}: ${res.affected} device(s)`, color: 'primary', icon: 'i-lucide-check' })
    if (action === 'enable' || action === 'disable' || action === 'ignore' || action === 'unignore') selected.value = new Set()
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Bulk action failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { bulkRunning.value = false }
}
const bulkItems = computed(() => [[
  { label: 'Poll now', icon: 'i-lucide-refresh-cw', onSelect: () => runBulk('poll') },
  { label: 'Rediscover', icon: 'i-lucide-scan-line', onSelect: () => runBulk('discover') }
], [
  { label: 'Enable', icon: 'i-lucide-play', onSelect: () => runBulk('enable') },
  { label: 'Disable', icon: 'i-lucide-pause', onSelect: () => runBulk('disable') },
  { label: 'Ignore (no alerts)', icon: 'i-lucide-bell-off', onSelect: () => runBulk('ignore') },
  { label: 'Un-ignore', icon: 'i-lucide-bell', onSelect: () => runBulk('unignore') }
], [
  { label: 'Delete…', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteConfirmOpen.value = true } }
]])

const deleteConfirmOpen = ref(false)
const deleting = ref(false)
async function confirmBulkDelete() {
  deleting.value = true
  try {
    const ids = [...selected.value]
    const res = await $fetch<any>('/api/monitoring/v1/devices', { method: 'DELETE', body: { ids } })
    toast.add({ title: `Deleted ${res.deleted} device(s)`, color: 'primary', icon: 'i-lucide-check' })
    selected.value = new Set()
    deleteConfirmOpen.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { deleting.value = false }
}

const statusItems = [
  { value: 'all', label: 'All statuses' }, { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' },
  { value: 'degraded', label: 'Degraded' }, { value: 'maintenance', label: 'Maintenance' },
  { value: 'disabled', label: 'Disabled' }, { value: 'pending', label: 'Pending' }
]
const typeFilterItems = [
  { value: 'all', label: 'All device types' },
  ...DEVICE_TYPES.map((t) => ({ value: t, label: deviceTypeMeta(t).label }))
]
const addTypeItems = [
  { value: '', label: '— auto (detect from SNMP) —' },
  ...DEVICE_TYPES.map((t) => ({ value: t, label: deviceTypeMeta(t).label }))
]

const addOpen = ref(false)
const ADD_DEFAULTS = {
  hostname: '', ip: '', snmp_disabled: false, force: false, device_type: '',
  credential_profile_id: null as number | null,
  snmp_version: 'v2c', snmp_community: '', snmp_port: null as number | null, snmp_context: '',
  v3_level: 'authPriv', v3_username: '', v3_auth_protocol: 'sha', v3_auth_password: '',
  v3_priv_protocol: 'aes', v3_priv_password: ''
}

const profileItems = ref<Array<{ value: number | null; label: string }>>([{ value: null, label: '— inline credentials —' }])
watch(addOpen, async (open) => {
  if (!open || profileItems.value.length > 1) return
  try {
    const res = await $fetch<any>('/api/monitoring/v1/credential-profiles')
    profileItems.value = [{ value: null, label: '— inline credentials —' },
      ...(res.items ?? []).map((p: any) => ({ value: p.id, label: `${p.name} (${p.snmp_version})` }))]
  } catch { /* keep inline-only */ }
})
const addForm = reactive({ ...ADD_DEFAULTS })
const adding = ref(false)
const testing = ref(false)
const testResult = ref<any>(null)

const v3LevelItems = [
  { value: 'noAuthNoPriv', label: 'noAuthNoPriv' }, { value: 'authNoPriv', label: 'authNoPriv' }, { value: 'authPriv', label: 'authPriv' }
]
const authProtoItems = ['md5', 'sha', 'sha224', 'sha256', 'sha384', 'sha512'].map((v) => ({ value: v, label: v.toUpperCase() }))
const privProtoItems = [
  { value: 'des', label: 'DES' }, { value: 'aes', label: 'AES-128' }, { value: 'aes256b', label: 'AES-256 (Blumenthal)' }, { value: 'aes256r', label: 'AES-256 (Reeder)' }
]

async function testConnection() {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await $fetch('/api/monitoring/v1/snmp/test', { method: 'POST', body: { ...addForm } })
  } catch (e: any) {
    testResult.value = { error: e?.data?.statusMessage || 'test failed' }
  } finally { testing.value = false }
}

async function submitAdd() {
  adding.value = true
  try {
    await $fetch('/api/monitoring/v1/devices', { method: 'POST', body: { ...addForm } })
    toast.add({ title: 'Device added', description: 'Discovery queued.', color: 'primary', icon: 'i-lucide-check' })
    addOpen.value = false
    Object.assign(addForm, ADD_DEFAULTS)
    testResult.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Add failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { adding.value = false }
}

const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / 50)))
</script>

<template>
  <div>
    <PageHeader title="Devices" subtitle="Unified device inventory" icon="i-lucide-router">
      <template v-if="hasMonitoring && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="addOpen = true">Add device</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access to the Monitoring app.</div>

    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center gap-2">
        <USelect v-model="filters.status" :items="statusItems" size="sm" class="w-44" />
        <USelect v-model="filters.device_type" :items="typeFilterItems" size="sm" class="w-44" />
        <UInput v-model="filters.q" placeholder="Search hostname / IP…" icon="i-lucide-search" size="sm" class="w-64" />
        <UDropdownMenu v-if="canManage && selected.size" :items="bulkItems">
          <UButton size="sm" variant="soft" icon="i-lucide-layers" :loading="bulkRunning" trailing-icon="i-lucide-chevron-down">
            Actions ({{ selected.size }})
          </UButton>
        </UDropdownMenu>
        <span class="ml-auto text-sm text-muted">{{ data?.total ?? 0 }} device{{ (data?.total ?? 0) === 1 ? '' : 's' }}</span>
      </div>

      <div class="panel overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase tracking-wide text-faint">
            <tr>
              <th v-if="canManage" class="w-8 px-3 py-2"><UCheckbox :model-value="allOnPageSelected" @update:model-value="toggleAllOnPage" /></th>
              <th class="px-3 py-2">Status</th><th class="px-3 py-2">Hostname</th>
              <th class="px-3 py-2">Type</th>
              <th class="px-3 py-2">IP</th><th class="px-3 py-2">OS</th>
              <th class="px-3 py-2 text-right">Uptime</th><th class="px-3 py-2 text-right">Ports</th>
              <th class="px-3 py-2 text-right">Sensors</th><th class="px-3 py-2 text-right">Alerts</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="status === 'pending'"><td :colspan="canManage ? 10 : 9" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
            <tr v-else-if="!data?.items?.length"><td :colspan="canManage ? 10 : 9" class="px-3 py-8 text-center text-muted">No devices. Add one to begin.</td></tr>
            <tr v-for="d in data.items" :key="d.id" class="border-t border-hull hover:bg-surface-2/50">
              <td v-if="canManage" class="px-3 py-2"><UCheckbox :model-value="selected.has(d.id)" @update:model-value="toggleOne(d.id)" /></td>
              <td class="px-3 py-2">
                <span :class="['inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs', deviceStatusMeta(d.status).badge]" :title="d.status_reason">
                  <span :class="['h-1.5 w-1.5 rounded-full', deviceStatusMeta(d.status).dot]" />
                  {{ deviceStatusMeta(d.status).label }}
                </span>
                <div v-if="d.status_reason" class="mt-0.5 max-w-[16rem] truncate text-xs text-faint" :title="d.status_reason">{{ d.status_reason }}</div>
              </td>
              <td class="px-3 py-2">
                <NuxtLink :to="`/monitoring/devices/${d.id}`" class="font-medium text-primary hover:underline">
                  {{ d.display_name || d.hostname }}
                </NuxtLink>
                <div v-if="d.display_name" class="text-xs text-faint">{{ d.hostname }}</div>
              </td>
              <td class="px-3 py-2">
                <span class="inline-flex items-center gap-1.5 text-xs text-muted" :title="d.device_type_manual ? 'manually set' : 'auto-detected'">
                  <UIcon :name="deviceTypeMeta(d.device_type).icon" class="h-3.5 w-3.5" />
                  {{ deviceTypeMeta(d.device_type).label }}
                </span>
              </td>
              <td class="px-3 py-2 font-mono text-xs">{{ d.ip || '—' }}</td>
              <td class="px-3 py-2">{{ d.os }}<span v-if="d.os_version" class="text-faint"> {{ d.os_version }}</span></td>
              <td class="px-3 py-2 text-right text-muted">{{ formatUptime(d.uptime_seconds) }}</td>
              <td class="px-3 py-2 text-right">{{ d.port_count }}</td>
              <td class="px-3 py-2 text-right">{{ d.sensor_count }}</td>
              <td class="px-3 py-2 text-right">
                <span v-if="d.active_alerts > 0" class="rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-400">{{ d.active_alerts }}</span>
                <span v-else class="text-faint">0</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="flex items-center justify-center gap-2">
        <UButton size="xs" :disabled="page <= 1" @click="page--">Prev</UButton>
        <span class="text-sm text-muted">{{ page }} / {{ totalPages }}</span>
        <UButton size="xs" :disabled="page >= totalPages" @click="page++">Next</UButton>
      </div>
    </div>

    <UModal v-model:open="addOpen" title="Add device">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Hostname or IP" required>
            <UInput v-model="addForm.hostname" placeholder="core-sw-01 or 10.0.0.1" class="w-full" />
          </UFormField>
          <UFormField label="Management IP (optional)">
            <UInput v-model="addForm.ip" placeholder="10.0.0.1" class="w-full" />
          </UFormField>
          <UFormField label="Device type" help="Auto maps from the detected OS during scan/discovery; pick one to pin it.">
            <USelect v-model="addForm.device_type" :items="addTypeItems" class="w-full" />
          </UFormField>
          <UCheckbox v-model="addForm.snmp_disabled" label="ICMP-only (no SNMP)" />
          <template v-if="!addForm.snmp_disabled">
            <UFormField v-if="profileItems.length > 1" label="Credential profile">
              <USelect v-model="addForm.credential_profile_id" :items="profileItems" class="w-full" />
            </UFormField>
            <div v-if="addForm.credential_profile_id" class="text-xs text-muted">
              Fields below override the profile; leave blank to use the profile's values.
            </div>
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="SNMP version">
                <USelect v-model="addForm.snmp_version" :items="[{value:'v1',label:'v1'},{value:'v2c',label:'v2c'},{value:'v3',label:'v3'}]" class="w-full" />
              </UFormField>
              <UFormField label="Port">
                <UInput v-model.number="addForm.snmp_port" type="number" placeholder="161" class="w-full" />
              </UFormField>
            </div>
            <UFormField v-if="addForm.snmp_version !== 'v3'" label="Community">
              <UInput v-model="addForm.snmp_community" type="password" placeholder="public" class="w-full" />
            </UFormField>
            <template v-else>
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Security level">
                  <USelect v-model="addForm.v3_level" :items="v3LevelItems" class="w-full" />
                </UFormField>
                <UFormField label="Username" required>
                  <UInput v-model="addForm.v3_username" class="w-full" />
                </UFormField>
              </div>
              <div v-if="addForm.v3_level !== 'noAuthNoPriv'" class="grid grid-cols-2 gap-3">
                <UFormField label="Auth protocol">
                  <USelect v-model="addForm.v3_auth_protocol" :items="authProtoItems" class="w-full" />
                </UFormField>
                <UFormField label="Auth password">
                  <UInput v-model="addForm.v3_auth_password" type="password" class="w-full" />
                </UFormField>
              </div>
              <div v-if="addForm.v3_level === 'authPriv'" class="grid grid-cols-2 gap-3">
                <UFormField label="Privacy protocol">
                  <USelect v-model="addForm.v3_priv_protocol" :items="privProtoItems" class="w-full" />
                </UFormField>
                <UFormField label="Privacy password">
                  <UInput v-model="addForm.v3_priv_password" type="password" class="w-full" />
                </UFormField>
              </div>
            </template>
            <UFormField label="SNMP context (optional)">
              <UInput v-model="addForm.snmp_context" class="w-full" />
            </UFormField>
          </template>
          <UCheckbox v-model="addForm.force" label="Force add (skip reachability preflight)" />

          <div v-if="testResult" class="rounded border border-hull bg-surface-2 p-3 text-xs">
            <div v-if="testResult.error" class="text-rose-400">{{ testResult.error }}</div>
            <template v-else>
              <div class="flex items-center gap-2">
                <span class="text-muted">ICMP:</span>
                <span :class="testResult.icmp?.alive ? 'text-emerald-400' : 'text-rose-400'">
                  {{ testResult.icmp?.alive ? `reply in ${testResult.icmp.rttMs ?? '?'} ms` : 'no reply' }}
                </span>
              </div>
              <div v-if="!addForm.snmp_disabled" class="mt-1 flex items-start gap-2">
                <span class="text-muted">SNMP:</span>
                <span v-if="testResult.snmp?.ok" class="text-emerald-400">
                  {{ testResult.snmp.system.sysName || 'ok' }} — {{ testResult.snmp.detected?.text }}
                  <template v-if="testResult.snmp.detected?.device_type"> · type: {{ deviceTypeMeta(testResult.snmp.detected.device_type).label }}</template>
                  ({{ testResult.snmp.durationMs }} ms)
                </span>
                <span v-else class="text-rose-400">{{ testResult.snmp?.outcome }}: {{ testResult.snmp?.error }}</span>
              </div>
              <div v-if="testResult.snmp?.ok && testResult.snmp.system.sysDescr" class="mt-1 break-all text-faint">
                {{ testResult.snmp.system.sysDescr }}
              </div>
            </template>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton variant="soft" icon="i-lucide-plug-zap" :loading="testing" :disabled="!addForm.hostname" @click="testConnection">Test connection</UButton>
          <div class="flex gap-2">
            <UButton variant="ghost" @click="addOpen = false">Cancel</UButton>
            <UButton :loading="adding" :disabled="!addForm.hostname" @click="submitAdd">Add device</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleteConfirmOpen" title="Delete devices">
      <template #body>
        <p class="text-sm text-muted">
          Delete <strong>{{ selected.size }}</strong> device(s) and all their collected data (ports, sensors, metrics,
          alerts, history)? This cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="deleteConfirmOpen = false">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="confirmBulkDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
