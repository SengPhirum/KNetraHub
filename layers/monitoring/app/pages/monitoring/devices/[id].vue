<script setup lang="ts">
// Device detail: tabbed view (overview, ports, health, processors, memory,
// storage, inventory, events, alerts, data collection, capture, settings)
// over real collected data.
import { SNMP_CAPTURE_PRESETS } from '../../../../shared/constants'

const route = useRoute()
const toast = useToast()
const id = computed(() => route.params.id as string)
const { canOperate, canManage, deviceStatusMeta, formatBits, formatBytes, formatUptime, usageBarClass } = useMonitoring()

const { data, status, refresh } = useAsyncData(`monDevice:${id.value}`,
  () => $fetch<any>(`/api/monitoring/v1/devices/${id.value}`),
  { server: false, default: () => null })

// SNMP credential profile assignment (device detail's own picker — the
// Settings > SNMP Credentials page only manages the profile list, it has no
// per-device assignment UI).
const { data: profilesData } = useAsyncData('monCredentialProfilesForDevice',
  () => $fetch<any>('/api/monitoring/v1/credential-profiles'),
  { server: false, default: () => ({ items: [] }) })
const profileItems = computed(() => [
  { value: 'none', label: '— None —' },
  ...(profilesData.value?.items ?? []).map((p: any) => ({ value: String(p.id), label: p.name }))
])
const selectedProfileId = ref('none')
watch(() => data.value?.device?.credential_profile_id, (pid) => {
  selectedProfileId.value = pid != null ? String(pid) : 'none'
}, { immediate: true })
const savingProfile = ref(false)
async function updateCredentialProfile(value: string) {
  savingProfile.value = true
  try {
    await $fetch(`/api/monitoring/v1/devices/${id.value}`, {
      method: 'PUT', body: { credential_profile_id: value === 'none' ? null : Number(value) }
    })
    toast.add({ title: 'SNMP credential updated', color: 'primary', icon: 'i-lucide-check' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' })
    selectedProfileId.value = data.value?.device?.credential_profile_id != null ? String(data.value.device.credential_profile_id) : 'none'
  } finally { savingProfile.value = false }
}

const tab = ref('overview')
// One expanded row (inline graph) per entity tab at a time.
const expandedEntity = ref<number | null>(null)
watch(tab, () => { expandedEntity.value = null })
function toggleExpand(entityId: number) {
  expandedEntity.value = expandedEntity.value === entityId ? null : entityId
}
const tabs = computed(() => {
  const base: Array<[string, string]> = [
    ['overview', 'Overview'], ['ports', 'Ports'], ['health', 'Health'], ['processors', 'Processors'],
    ['memory', 'Memory'], ['storage', 'Storage'], ['inventory', 'Inventory'], ['events', 'Events'],
    ['alerts', 'Alerts'], ['data', 'Data collection']
  ]
  if (canOperate.value) base.push(['capture', 'Capture'])
  if (canManage.value) base.push(['settings', 'Settings'])
  return base
})

// Lazily load the active tab's sub-resource.
const subData = ref<any>({ items: [] })
const subLoading = ref(false)
const SUB_ENDPOINTS: Record<string, string> = {
  ports: 'ports', health: 'sensors', processors: 'processors', memory: 'mempools',
  storage: 'storage', inventory: 'inventory', events: 'events', alerts: 'alerts'
}
async function loadTab(t: string) {
  if (t === 'settings') {
    initSettings()
    loadLocations()
    loadDependencies()
    loadModuleSettings()
    return
  }
  const ep = SUB_ENDPOINTS[t]
  if (!ep) return
  subLoading.value = true
  try {
    subData.value = await $fetch<any>(`/api/monitoring/v1/devices/${id.value}/${ep}`)
  } finally { subLoading.value = false }
}
watch(tab, (t) => loadTab(t))

const actionRunning = ref<'poll' | 'discover' | null>(null)
async function runAction(action: 'poll' | 'discover') {
  const label = action === 'poll' ? 'Poll' : 'Discovery'
  const stampField = action === 'poll' ? 'last_polled_at' : 'last_discovered_at'
  const stampBefore = d.value?.[stampField]
  actionRunning.value = action
  try {
    await $fetch(`/api/monitoring/v1/devices/${id.value}/${action}`, { method: 'POST' })
    toast.add({ title: `${label} queued`, color: 'primary', icon: 'i-lucide-check' })
    // Jobs run in the background (SNMP timeouts alone can take several
    // seconds) — without this the page just sits stale until a manual
    // reload, which reads as "the button doesn't do anything."
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      await refresh()
      if (d.value?.[stampField] && d.value[stampField] !== stampBefore) {
        toast.add({ title: `${label} complete`, color: 'primary', icon: 'i-lucide-check-check' })
        if (SUB_ENDPOINTS[tab.value]) await loadTab(tab.value)
        return
      }
    }
    toast.add({ title: `${label} still running`, description: 'Taking longer than expected — check Jobs or reload shortly.', color: 'warning' })
  } catch (e: any) {
    toast.add({ title: 'Action failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    actionRunning.value = null
  }
}

const d = computed(() => data.value?.device)

async function togglePortFlag(p: any, flag: 'ignored' | 'disabled') {
  try {
    await $fetch(`/api/monitoring/v1/ports/${p.id}`, { method: 'PUT', body: { [flag]: !p[flag] } })
    p[flag] = !p[flag]
  } catch (e: any) {
    toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

// --- Capture tab: ad-hoc raw SNMP get/walk against this device. ---
const presetItems = SNMP_CAPTURE_PRESETS.map((p) => ({ value: p.value, label: `${p.label} — ${p.oid}` }))
const capForm = reactive({ op: 'walk', preset: 'system', oid: '', oids: '1.3.6.1.2.1.1.1.0 1.3.6.1.2.1.1.5.0', max_rows: 2000 })
const capRunning = ref(false)
const capResult = ref<any>(null)

async function runCapture() {
  capRunning.value = true
  capResult.value = null
  try {
    const body: Record<string, any> = { op: capForm.op, max_rows: capForm.max_rows }
    if (capForm.op === 'walk') {
      if (capForm.oid.trim()) body.oid = capForm.oid.trim()
      else body.preset = capForm.preset
    } else {
      body.oids = capForm.oids.split(/[\s,]+/).filter(Boolean)
    }
    capResult.value = await $fetch<any>(`/api/monitoring/v1/devices/${id.value}/capture`, { method: 'POST', body })
  } catch (e: any) {
    capResult.value = { ok: false, error: e?.data?.statusMessage || 'capture failed' }
  } finally { capRunning.value = false }
}

function downloadCapture() {
  if (!capResult.value?.rows?.length) return
  const lines = capResult.value.rows.map((r: any) =>
    `${r.oid}${r.name ? ` (${r.name})` : ''} = ${r.type}: ${r.value ?? 'null'}`)
  const header = `# ${capResult.value.target} — ${capForm.op} — ${new Date().toISOString()}\n# rows=${capResult.value.row_count} duration=${capResult.value.duration_ms}ms${capResult.value.truncated ? ' TRUNCATED' : ''}\n`
  const blob = new Blob([header + lines.join('\n') + '\n'], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `snmp-capture-device${id.value}-${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(a.href)
}

// --- Settings tab: full device configuration (PUT /devices/:id). ---
const v3LevelItems = [
  { value: 'noAuthNoPriv', label: 'noAuthNoPriv' }, { value: 'authNoPriv', label: 'authNoPriv' }, { value: 'authPriv', label: 'authPriv' }
]
const authProtoItems = ['md5', 'sha', 'sha224', 'sha256', 'sha384', 'sha512'].map((v) => ({ value: v, label: v.toUpperCase() }))
const privProtoItems = [
  { value: 'des', label: 'DES' }, { value: 'aes', label: 'AES-128' }, { value: 'aes256b', label: 'AES-256 (Blumenthal)' }, { value: 'aes256r', label: 'AES-256 (Reeder)' }
]
const assocItems = ['ifIndex', 'ifName', 'ifDescr', 'ifAlias'].map((v) => ({ value: v, label: v }))

const settingsForm = reactive<Record<string, any>>({})
const locations = ref<Array<{ value: number | null; label: string }>>([])
// Settings-tab variant of the profile picker (number ids + explicit "none"),
// backed by the same profilesData fetch as the overview picker above.
const settingsProfileItems = computed(() => [
  { value: null, label: '— per-device credentials —' },
  ...(profilesData.value?.items ?? []).map((p: any) => ({ value: p.id, label: `${p.name} (${p.snmp_version})` }))
])
const saving = ref(false)
const deviceTest = ref<any>(null)
const deviceTesting = ref(false)

function initSettings() {
  const dev = d.value
  if (!dev) return
  Object.assign(settingsForm, {
    display_name: dev.display_name || '',
    ip: dev.ip || '',
    snmp_disabled: !!dev.snmp_disabled,
    credential_profile_id: dev.credential_profile_id,
    snmp_version: dev.snmp_version || 'v2c',
    snmp_community: '',
    snmp_port: dev.snmp_port,
    snmp_context: dev.snmp_context || '',
    v3_level: dev.v3_level || 'authPriv',
    v3_username: dev.v3_username || '',
    v3_auth_protocol: dev.v3_auth_protocol || 'sha',
    v3_auth_password: '',
    v3_priv_protocol: dev.v3_priv_protocol || 'aes',
    v3_priv_password: '',
    os_override: dev.os_override || '',
    hardware_override: dev.hardware_override || '',
    location_id: dev.location_id,
    poller_group: dev.poller_group ?? 0,
    port_association_mode: dev.port_association_mode || 'ifIndex',
    poll_interval_seconds: dev.poll_interval_seconds,
    discovery_interval_seconds: dev.discovery_interval_seconds,
    notes: dev.notes || '',
    disabled: !!dev.disabled,
    ignored: !!dev.ignored
  })
  deviceTest.value = null
}

// --- Dependencies (alert suppression when every parent is down) ---
const parentIds = ref<number[]>([])
const depDevices = ref<Array<{ value: number; label: string }>>([])
const savingDeps = ref(false)
async function loadDependencies() {
  try {
    const [deps, all] = await Promise.all([
      $fetch<any>(`/api/monitoring/v1/devices/${id.value}/dependencies`),
      $fetch<any>('/api/monitoring/v1/devices?per_page=500')
    ])
    parentIds.value = (deps.parents ?? []).map((p: any) => p.id)
    depDevices.value = (all.items ?? [])
      .filter((dv: any) => dv.id !== Number(id.value))
      .map((dv: any) => ({ value: dv.id, label: dv.display_name || dv.hostname }))
  } catch { /* panel shows empty picker */ }
}
async function saveDependencies() {
  savingDeps.value = true
  try {
    await $fetch(`/api/monitoring/v1/devices/${id.value}/dependencies`, {
      method: 'PUT', body: { parent_ids: parentIds.value }
    })
    toast.add({ title: 'Dependencies updated', color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { savingDeps.value = false }
}

// --- Per-device discovery/poll module overrides ---
const moduleRegistry = ref<{ discovery: any[]; poll: any[] }>({ discovery: [], poll: [] })
const moduleOverrides = ref<any[]>([])
async function loadModuleSettings() {
  try {
    const res = await $fetch<any>(`/api/monitoring/v1/module-settings?scope=device&scope_ref=${id.value}`)
    moduleRegistry.value = res.modules
    moduleOverrides.value = res.overrides
  } catch { /* panel hidden on failure */ }
}
function moduleState(phase: string, name: string): 'inherit' | 'on' | 'off' {
  const ov = moduleOverrides.value.find((o: any) => o.phase === phase && o.module === name)
  return ov ? (ov.enabled ? 'on' : 'off') : 'inherit'
}
async function setModuleState(phase: string, name: string, state: 'inherit' | 'on' | 'off') {
  try {
    await $fetch('/api/monitoring/v1/module-settings', {
      method: 'PUT',
      body: { changes: [{ scope: 'device', scope_ref: String(id.value), phase, module: name, enabled: state === 'inherit' ? null : state === 'on' }] }
    })
    await loadModuleSettings()
  } catch (e: any) {
    toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' })
  }
}
const moduleStateItems = [
  { value: 'inherit', label: 'inherit' }, { value: 'on', label: 'on' }, { value: 'off', label: 'off' }
]

async function loadLocations() {
  try {
    const res = await $fetch<any>('/api/monitoring/v1/locations?per_page=500')
    locations.value = [{ value: null, label: '— auto (sysLocation) —' },
      ...(res.items ?? []).map((l: any) => ({ value: l.id, label: l.name }))]
  } catch { /* picker stays empty; field still editable via auto option */ }
}

async function saveSettings() {
  saving.value = true
  try {
    await $fetch(`/api/monitoring/v1/devices/${id.value}`, { method: 'PUT', body: { ...settingsForm } })
    toast.add({ title: 'Device updated', color: 'primary', icon: 'i-lucide-check' })
    await refresh()
    initSettings()
  } catch (e: any) {
    toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

async function testDevice() {
  deviceTesting.value = true
  deviceTest.value = null
  try {
    deviceTest.value = await $fetch<any>('/api/monitoring/v1/snmp/test', { method: 'POST', body: { device_id: Number(id.value) } })
  } catch (e: any) {
    deviceTest.value = { error: e?.data?.statusMessage || 'test failed' }
  } finally { deviceTesting.value = false }
}

async function deleteDevice() {
  if (!confirm(`Delete ${d.value?.display_name || d.value?.hostname} and all its collected data? This cannot be undone.`)) return
  try {
    await $fetch(`/api/monitoring/v1/devices/${id.value}`, { method: 'DELETE' })
    toast.add({ title: 'Device deleted', color: 'primary', icon: 'i-lucide-check' })
    navigateTo('/monitoring/devices')
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  }
}
</script>

<template>
  <div>
    <div v-if="status === 'pending'" class="panel p-10 text-center text-muted">Loading…</div>
    <div v-else-if="!d" class="panel p-10 text-center text-muted">Device not found.</div>
    <div v-else>
      <PageHeader :title="d.display_name || d.hostname" :subtitle="d.ip || d.hostname" icon="i-lucide-router">
        <template #actions>
          <div class="flex items-center gap-2">
            <span :class="['inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs', deviceStatusMeta(d.status).badge]">
              <span :class="['h-1.5 w-1.5 rounded-full', deviceStatusMeta(d.status).dot]" />
              {{ deviceStatusMeta(d.status).label }}
            </span>
            <span v-if="d.status_reason" class="text-xs text-amber-400">{{ d.status_reason }}</span>
            <UButton v-if="canOperate" size="sm" variant="soft" icon="i-lucide-refresh-cw" :loading="actionRunning === 'poll'"
              :disabled="!!actionRunning" @click="runAction('poll')">Poll now</UButton>
            <UButton v-if="canOperate" size="sm" variant="soft" icon="i-lucide-scan-line" :loading="actionRunning === 'discover'"
              :disabled="!!actionRunning" @click="runAction('discover')">Rediscover</UButton>
          </div>
        </template>
      </PageHeader>

      <div class="mb-4 flex flex-wrap gap-1 border-b border-hull">
        <button v-for="[key, label] in tabs" :key="key"
          :class="['px-3 py-2 text-sm', tab === key ? 'border-b-2 border-primary font-medium text-primary' : 'text-muted hover:text-default']"
          @click="tab = key">{{ label }}</button>
      </div>

      <!-- Overview -->
      <div v-if="tab === 'overview'" class="grid gap-6 lg:grid-cols-3">
        <div class="panel p-4 lg:col-span-2">
          <h2 class="mb-3 font-semibold">System</h2>
          <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div class="flex justify-between"><dt class="text-muted">Hostname</dt><dd>{{ d.hostname }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Management IP</dt><dd class="font-mono text-xs">{{ d.ip || '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">OS</dt><dd>{{ d.os }} {{ d.os_version }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Vendor</dt><dd>{{ d.vendor || '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Hardware</dt><dd>{{ d.hardware || '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Serial</dt><dd>{{ d.serial || '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Uptime</dt><dd>{{ formatUptime(d.uptime_seconds) }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Location</dt><dd>{{ d.location_name || '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">sysName</dt><dd>{{ d.sys_name || '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">ICMP / SNMP</dt><dd>{{ d.icmp_status }} / {{ d.snmp_status }}</dd></div>
            <div class="flex justify-between">
              <dt class="text-muted">SNMP credential</dt>
              <dd class="text-right">
                <span v-if="d.snmp_disabled" class="text-faint">ICMP-only</span>
                <div v-else-if="canManage">
                  <USelect v-model="selectedProfileId" :items="profileItems" size="xs" class="w-40"
                    :disabled="savingProfile" @update:model-value="updateCredentialProfile" />
                  <div v-if="d.snmp_community_set || d.v3_auth_password_set" class="mt-0.5 text-[11px] text-amber-400">
                    device-specific settings also set — those win per-field
                  </div>
                  <div v-else-if="!profilesData?.items?.length" class="mt-0.5 text-[11px] text-faint">
                    No profiles yet —
                    <NuxtLink to="/monitoring/settings/credentials" class="underline">create one</NuxtLink>
                  </div>
                </div>
                <template v-else>
                  <span v-if="d.snmp_community_set || d.v3_auth_password_set">device-specific</span>
                  <span v-else-if="d.credential_profile_name">{{ d.credential_profile_name }}</span>
                  <span v-else class="text-amber-400">
                    none —
                    <NuxtLink to="/monitoring/settings/credentials" class="underline">add one</NuxtLink>
                  </span>
                </template>
              </dd>
            </div>
            <div class="flex justify-between"><dt class="text-muted">Last polled</dt><dd class="text-xs">{{ d.last_polled_at ? new Date(d.last_polled_at).toLocaleString() : '—' }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Last discovered</dt><dd class="text-xs">{{ d.last_discovered_at ? new Date(d.last_discovered_at).toLocaleString() : '—' }}</dd></div>
          </dl>
        </div>
        <div class="space-y-4">
          <div class="panel p-4">
            <h2 class="mb-3 font-semibold">Entities</h2>
            <dl class="space-y-1.5 text-sm">
              <div class="flex justify-between"><dt class="text-muted">Ports</dt><dd>{{ data.counts.ports }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Sensors</dt><dd>{{ data.counts.sensors }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Processors</dt><dd>{{ data.counts.processors }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Memory pools</dt><dd>{{ data.counts.mempools }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Storage</dt><dd>{{ data.counts.storage }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Active alerts</dt><dd>{{ data.counts.active_alerts }}</dd></div>
            </dl>
          </div>
          <div class="panel p-4">
            <h2 class="mb-3 font-semibold">Availability</h2>
            <dl class="space-y-1.5 text-sm">
              <div v-for="(pct, dur) in data.availability" :key="dur" class="flex justify-between">
                <dt class="text-muted">{{ dur }}</dt><dd>{{ pct.toFixed(3) }}%</dd>
              </div>
              <div v-if="!Object.keys(data.availability).length" class="text-muted">Not yet computed.</div>
            </dl>
          </div>
        </div>
        <div class="panel p-4 lg:col-span-3">
          <MonMetricChart kind="metric" metric="icmp_rtt_ms" :id="0" :device-id="Number(id)" unit="ms" title="ICMP latency" :height="180" />
        </div>
      </div>

      <!-- Ports -->
      <div v-else-if="tab === 'ports'" class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Port</th><th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Speed</th>
              <th class="px-3 py-2 text-right">In</th><th class="px-3 py-2 text-right">Out</th>
              <th class="px-3 py-2 text-right">In util</th><th class="px-3 py-2 text-right">Errors</th>
              <th v-if="canManage" class="px-3 py-2" /></tr>
          </thead>
          <tbody>
            <tr v-if="subLoading"><td :colspan="canManage ? 8 : 7" class="px-3 py-6 text-center text-muted">Loading…</td></tr>
            <template v-for="p in subData.items" :key="p.id">
              <tr class="cursor-pointer border-t border-hull hover:bg-surface-2/40" :class="p.disabled ? 'opacity-50' : ''"
                @click="toggleExpand(p.id)">
                <td class="px-3 py-2">
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-chevron-right" :class="['h-3 w-3 text-faint transition-transform', expandedEntity === p.id ? 'rotate-90' : '']" />
                    {{ p.if_name || p.if_descr }}
                  </span>
                  <div v-if="p.if_alias" class="text-xs text-faint">{{ p.if_alias }}</div>
                </td>
                <td class="px-3 py-2">
                  <span :class="p.oper_status === 'up' ? 'text-emerald-400' : 'text-rose-400'">{{ p.oper_status }}</span>
                  <span v-if="p.admin_status === 'down'" class="text-faint"> (admin down)</span>
                  <span v-if="p.disabled" class="ml-1 rounded bg-surface-2 px-1 py-0.5 text-[10px] uppercase text-faint">not polled</span>
                  <span v-else-if="p.ignored" class="ml-1 rounded bg-surface-2 px-1 py-0.5 text-[10px] uppercase text-faint">no alerts</span>
                </td>
                <td class="px-3 py-2 text-right text-muted">{{ formatBits(p.speed_bps) }}</td>
                <td class="px-3 py-2 text-right">{{ formatBits(p.in_bps) }}</td>
                <td class="px-3 py-2 text-right">{{ formatBits(p.out_bps) }}</td>
                <td class="px-3 py-2 text-right">{{ p.in_util_percent != null ? p.in_util_percent.toFixed(1) + '%' : '—' }}</td>
                <td class="px-3 py-2 text-right">{{ ((p.in_errors_ps ?? 0) + (p.out_errors_ps ?? 0)).toFixed(2) }}/s</td>
                <td v-if="canManage" class="px-3 py-2 text-right whitespace-nowrap" @click.stop>
                  <UButton size="xs" variant="ghost" :icon="p.ignored ? 'i-lucide-bell' : 'i-lucide-bell-off'"
                    :title="p.ignored ? 'Re-enable alerts for this port' : 'Ignore (no alerts/events)'"
                    @click="togglePortFlag(p, 'ignored')" />
                  <UButton size="xs" variant="ghost" :icon="p.disabled ? 'i-lucide-play' : 'i-lucide-pause'"
                    :title="p.disabled ? 'Resume polling this port' : 'Stop polling this port'"
                    @click="togglePortFlag(p, 'disabled')" />
                </td>
              </tr>
              <tr v-if="expandedEntity === p.id" class="border-t border-hull bg-surface-2/30">
                <td :colspan="canManage ? 8 : 7" class="px-4 py-3">
                  <MonMetricChart kind="port" :id="p.id" unit="bps" :title="`Traffic — ${p.if_name || p.if_descr}`" :height="200" />
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Health sensors -->
      <div v-else-if="tab === 'health'" class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Sensor</th><th class="px-3 py-2">Class</th><th class="px-3 py-2 text-right">Value</th>
              <th class="px-3 py-2 text-right">Thresholds</th><th class="px-3 py-2">Status</th></tr>
          </thead>
          <tbody>
            <tr v-if="subLoading"><td colspan="5" class="px-3 py-6 text-center text-muted">Loading…</td></tr>
            <template v-for="s in subData.items" :key="s.id">
              <tr class="cursor-pointer border-t border-hull hover:bg-surface-2/40" @click="toggleExpand(s.id)">
                <td class="px-3 py-2">
                  <span class="inline-flex items-center gap-1">
                    <UIcon name="i-lucide-chevron-right" :class="['h-3 w-3 text-faint transition-transform', expandedEntity === s.id ? 'rotate-90' : '']" />
                    {{ s.description }}
                  </span>
                </td>
                <td class="px-3 py-2 text-muted">{{ s.sensor_class }}</td>
                <td class="px-3 py-2 text-right">{{ s.current_value != null ? s.current_value.toFixed(2) : '—' }} {{ s.unit }}</td>
                <td class="px-3 py-2 text-right text-xs text-faint">
                  <span v-if="s.warn_high != null || s.crit_high != null">W:{{ s.warn_high ?? '—' }} C:{{ s.crit_high ?? '—' }}</span>
                  <span v-else>—</span>
                </td>
                <td class="px-3 py-2"><span :class="s.status === 'critical' ? 'text-rose-400' : s.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'">{{ s.status }}</span></td>
              </tr>
              <tr v-if="expandedEntity === s.id" class="border-t border-hull bg-surface-2/30">
                <td colspan="5" class="px-4 py-3">
                  <MonMetricChart kind="sensor" :id="s.id" unit="raw" :title="`${s.description}${s.unit ? ` (${s.unit})` : ''}`" :height="200" />
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Processors / Memory / Storage (usage bars + expandable history) -->
      <div v-else-if="['processors','memory','storage'].includes(tab)" class="panel divide-y divide-hull">
        <div v-if="subLoading" class="px-4 py-6 text-center text-muted">Loading…</div>
        <div v-else-if="!subData.items.length" class="px-4 py-6 text-center text-muted">None discovered.</div>
        <div v-for="e in subData.items" :key="e.id" class="px-4 py-3">
          <div class="mb-1 flex cursor-pointer items-center justify-between text-sm" @click="toggleExpand(e.id)">
            <span class="inline-flex items-center gap-1">
              <UIcon name="i-lucide-chevron-right" :class="['h-3 w-3 text-faint transition-transform', expandedEntity === e.id ? 'rotate-90' : '']" />
              {{ e.description }}
            </span>
            <span class="text-muted">
              <template v-if="tab === 'processors'">{{ e.usage_percent != null ? e.usage_percent.toFixed(0) + '%' : '—' }}</template>
              <template v-else>{{ formatBytes(e.used_bytes) }} / {{ formatBytes(e.total_bytes) }} ({{ (e.usage_percent ?? 0).toFixed(0) }}%)</template>
            </span>
          </div>
          <div class="h-2 overflow-hidden rounded bg-surface-2">
            <div :class="['h-full', usageBarClass(e.usage_percent)]" :style="{ width: Math.min(100, e.usage_percent ?? 0) + '%' }" />
          </div>
          <div v-if="expandedEntity === e.id" class="mt-3">
            <MonMetricChart kind="metric"
              :metric="tab === 'processors' ? 'processor_usage' : tab === 'memory' ? 'mempool_usage_percent' : 'storage_usage_percent'"
              :id="e.id" unit="percent" :title="`Usage — ${e.description}`" :height="180" />
          </div>
        </div>
      </div>

      <!-- Inventory -->
      <div v-else-if="tab === 'inventory'" class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Class</th><th class="px-3 py-2">Name</th><th class="px-3 py-2">Model</th>
              <th class="px-3 py-2">Serial</th><th class="px-3 py-2">HW / FW / SW</th></tr>
          </thead>
          <tbody>
            <tr v-if="subLoading"><td colspan="5" class="px-3 py-6 text-center text-muted">Loading…</td></tr>
            <tr v-for="i in subData.items" :key="i.id" class="border-t border-hull">
              <td class="px-3 py-2 text-muted">{{ i.class }}</td>
              <td class="px-3 py-2">{{ i.name || i.descr }}</td>
              <td class="px-3 py-2">{{ i.model || '—' }}</td>
              <td class="px-3 py-2 font-mono text-xs">{{ i.serial || '—' }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ [i.hardware_rev, i.firmware_rev, i.software_rev].filter(Boolean).join(' / ') || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Events -->
      <div v-else-if="tab === 'events'" class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Time</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Severity</th><th class="px-3 py-2">Message</th></tr>
          </thead>
          <tbody>
            <tr v-if="subLoading"><td colspan="4" class="px-3 py-6 text-center text-muted">Loading…</td></tr>
            <tr v-for="e in subData.items" :key="e.id" class="border-t border-hull">
              <td class="px-3 py-2 whitespace-nowrap text-xs text-faint">{{ new Date(e.created_at).toLocaleString() }}</td>
              <td class="px-3 py-2 text-muted">{{ e.event_type }}</td>
              <td class="px-3 py-2"><span :class="e.severity === 'error' ? 'text-rose-400' : e.severity === 'warning' ? 'text-amber-400' : 'text-muted'">{{ e.severity }}</span></td>
              <td class="px-3 py-2">{{ e.message }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Alerts -->
      <div v-else-if="tab === 'alerts'" class="panel overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
            <tr><th class="px-3 py-2">Rule</th><th class="px-3 py-2">Severity</th><th class="px-3 py-2">State</th><th class="px-3 py-2">Opened</th></tr>
          </thead>
          <tbody>
            <tr v-if="subLoading"><td colspan="4" class="px-3 py-6 text-center text-muted">Loading…</td></tr>
            <tr v-for="a in subData.items" :key="a.id" class="border-t border-hull">
              <td class="px-3 py-2">{{ a.rule_name }}</td>
              <td class="px-3 py-2"><span :class="a.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'">{{ a.severity }}</span></td>
              <td class="px-3 py-2 text-muted">{{ a.state }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ new Date(a.opened_at).toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Data collection -->
      <div v-else-if="tab === 'data'" class="panel p-4">
        <h2 class="mb-3 font-semibold">Last poll run</h2>
        <div v-if="!data.last_poll" class="text-muted">No poll run recorded yet.</div>
        <dl v-else class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div><dt class="text-muted">Status</dt><dd :class="data.last_poll.status === 'complete' ? 'text-emerald-400' : 'text-amber-400'">{{ data.last_poll.status }}</dd></div>
          <div><dt class="text-muted">Planned</dt><dd>{{ data.last_poll.planned_items }}</dd></div>
          <div><dt class="text-muted">Succeeded</dt><dd>{{ data.last_poll.succeeded_items }}</dd></div>
          <div><dt class="text-muted">Unsupported</dt><dd>{{ data.last_poll.unsupported_items }}</dd></div>
          <div><dt class="text-muted">Failed</dt><dd :class="data.last_poll.failed_items ? 'text-rose-400' : ''">{{ data.last_poll.failed_items }}</dd></div>
          <div><dt class="text-muted">Finished</dt><dd class="text-xs">{{ data.last_poll.finished_at ? new Date(data.last_poll.finished_at).toLocaleString() : '—' }}</dd></div>
        </dl>
        <NuxtLink :to="`/monitoring/data-collection?device_id=${id}`" class="mt-3 inline-block text-sm text-primary hover:underline">
          Full collection breakdown →
        </NuxtLink>
      </div>

      <!-- Capture: ad-hoc raw SNMP query tool -->
      <div v-else-if="tab === 'capture'" class="space-y-4">
        <div class="panel p-4">
          <h2 class="mb-1 font-semibold">Raw SNMP capture</h2>
          <p class="mb-3 text-xs text-muted">
            Run an ad-hoc GET or subtree walk against this device with its stored credentials and inspect
            every varbind exactly as returned. Nothing is saved.
          </p>
          <div class="flex flex-wrap items-end gap-3">
            <UFormField label="Operation">
              <USelect v-model="capForm.op" :items="[{value:'walk',label:'Walk (subtree)'},{value:'get',label:'Get (scalars)'}]" size="sm" class="w-40" />
            </UFormField>
            <template v-if="capForm.op === 'walk'">
              <UFormField label="Preset subtree">
                <USelect v-model="capForm.preset" :items="presetItems" size="sm" class="w-96" :disabled="!!capForm.oid.trim()" />
              </UFormField>
              <UFormField label="Custom base OID (overrides preset)">
                <UInput v-model="capForm.oid" placeholder="1.3.6.1.2.1.2.2" size="sm" class="w-64 font-mono" />
              </UFormField>
              <UFormField label="Max rows">
                <UInput v-model.number="capForm.max_rows" type="number" size="sm" class="w-28" />
              </UFormField>
            </template>
            <UFormField v-else label="OIDs (space/comma separated)" class="grow">
              <UInput v-model="capForm.oids" placeholder="1.3.6.1.2.1.1.1.0 1.3.6.1.2.1.1.5.0" size="sm" class="w-full font-mono" />
            </UFormField>
            <UButton size="sm" icon="i-lucide-play" :loading="capRunning" @click="runCapture">Run</UButton>
          </div>
        </div>

        <div v-if="capResult" class="panel overflow-hidden">
          <div class="flex flex-wrap items-center gap-3 border-b border-hull bg-surface-2 px-3 py-2 text-xs">
            <template v-if="capResult.ok">
              <span class="font-mono text-faint">{{ capResult.target }}</span>
              <span>{{ capResult.row_count }} rows in {{ capResult.duration_ms }} ms</span>
              <span v-if="capResult.truncated" class="text-amber-400">truncated — {{ capResult.note }}</span>
              <UButton size="xs" variant="soft" icon="i-lucide-download" class="ml-auto" @click="downloadCapture">Download</UButton>
            </template>
            <span v-else class="text-rose-400">{{ capResult.outcome ? `${capResult.outcome}: ` : '' }}{{ capResult.error }}</span>
          </div>
          <div v-if="capResult.ok" class="max-h-[32rem] overflow-auto">
            <table class="w-full text-xs">
              <thead class="sticky top-0 bg-surface-2 text-left uppercase text-faint">
                <tr><th class="px-3 py-1.5">OID</th><th class="px-3 py-1.5">Name</th><th class="px-3 py-1.5">Type</th><th class="px-3 py-1.5">Value</th></tr>
              </thead>
              <tbody>
                <tr v-if="!capResult.rows.length"><td colspan="4" class="px-3 py-6 text-center text-muted">No varbinds returned.</td></tr>
                <tr v-for="r in capResult.rows" :key="r.oid" class="border-t border-hull align-top">
                  <td class="px-3 py-1 font-mono">{{ r.oid }}</td>
                  <td class="px-3 py-1 text-muted">{{ r.name || '—' }}</td>
                  <td class="px-3 py-1 text-faint">{{ r.type }}</td>
                  <td class="max-w-xl break-all px-3 py-1 font-mono">{{ r.value ?? 'null' }}<span v-if="r.hex && String(r.value) !== r.hex" class="ml-1 text-faint">(hex {{ r.hex }})</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Settings: full device configuration -->
      <div v-else-if="tab === 'settings'" class="space-y-4">
        <div class="panel p-4">
          <h2 class="mb-3 font-semibold">Identity</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Display name"><UInput v-model="settingsForm.display_name" :placeholder="d.hostname" class="w-full" /></UFormField>
            <UFormField label="Management IP"><UInput v-model="settingsForm.ip" placeholder="10.0.0.1" class="w-full" /></UFormField>
            <UFormField label="OS override"><UInput v-model="settingsForm.os_override" :placeholder="d.os" class="w-full" /></UFormField>
            <UFormField label="Hardware override"><UInput v-model="settingsForm.hardware_override" :placeholder="d.hardware || ''" class="w-full" /></UFormField>
            <UFormField label="Notes" class="sm:col-span-2"><UTextarea v-model="settingsForm.notes" :rows="2" class="w-full" /></UFormField>
          </div>
        </div>

        <div class="panel p-4">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="font-semibold">SNMP</h2>
            <UButton size="xs" variant="soft" icon="i-lucide-plug-zap" :loading="deviceTesting" @click="testDevice">Test now</UButton>
          </div>
          <UCheckbox v-model="settingsForm.snmp_disabled" label="ICMP-only (disable SNMP)" class="mb-3" />
          <div v-if="!settingsForm.snmp_disabled" class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Credential profile" class="sm:col-span-2">
              <USelect v-model="settingsForm.credential_profile_id" :items="settingsProfileItems" class="w-full" />
            </UFormField>
            <UFormField label="Version">
              <USelect v-model="settingsForm.snmp_version" :items="[{value:'v1',label:'v1'},{value:'v2c',label:'v2c'},{value:'v3',label:'v3'}]" class="w-full" />
            </UFormField>
            <UFormField label="Port"><UInput v-model.number="settingsForm.snmp_port" type="number" placeholder="161" class="w-full" /></UFormField>
            <UFormField v-if="settingsForm.snmp_version !== 'v3'" :label="`Community${d.snmp_community_set ? ' (set — blank keeps current)' : ''}`">
              <UInput v-model="settingsForm.snmp_community" type="password" :placeholder="d.snmp_community_set ? '••••••••' : 'public'" class="w-full" />
            </UFormField>
            <template v-else>
              <UFormField label="Security level"><USelect v-model="settingsForm.v3_level" :items="v3LevelItems" class="w-full" /></UFormField>
              <UFormField label="Username"><UInput v-model="settingsForm.v3_username" class="w-full" /></UFormField>
              <template v-if="settingsForm.v3_level !== 'noAuthNoPriv'">
                <UFormField label="Auth protocol"><USelect v-model="settingsForm.v3_auth_protocol" :items="authProtoItems" class="w-full" /></UFormField>
                <UFormField :label="`Auth password${d.v3_auth_password_set ? ' (set — blank keeps current)' : ''}`">
                  <UInput v-model="settingsForm.v3_auth_password" type="password" :placeholder="d.v3_auth_password_set ? '••••••••' : ''" class="w-full" />
                </UFormField>
              </template>
              <template v-if="settingsForm.v3_level === 'authPriv'">
                <UFormField label="Privacy protocol"><USelect v-model="settingsForm.v3_priv_protocol" :items="privProtoItems" class="w-full" /></UFormField>
                <UFormField :label="`Privacy password${d.v3_priv_password_set ? ' (set — blank keeps current)' : ''}`">
                  <UInput v-model="settingsForm.v3_priv_password" type="password" :placeholder="d.v3_priv_password_set ? '••••••••' : ''" class="w-full" />
                </UFormField>
              </template>
            </template>
            <UFormField label="Context"><UInput v-model="settingsForm.snmp_context" class="w-full" /></UFormField>
          </div>

          <div v-if="deviceTest" class="mt-3 rounded border border-hull bg-surface-2 p-3 text-xs">
            <div v-if="deviceTest.error" class="text-rose-400">{{ deviceTest.error }}</div>
            <template v-else>
              <div>
                <span class="text-muted">ICMP:</span>
                <span :class="deviceTest.icmp?.alive ? 'text-emerald-400' : 'text-rose-400'">
                  {{ deviceTest.icmp?.alive ? ` reply in ${deviceTest.icmp.rttMs ?? '?'} ms` : ' no reply' }}
                </span>
                <span class="ml-4 text-muted">SNMP:</span>
                <span v-if="deviceTest.snmp?.ok" class="text-emerald-400">
                  {{ deviceTest.snmp.system.sysName || 'ok' }} — {{ deviceTest.snmp.detected?.text }} ({{ deviceTest.snmp.durationMs }} ms)
                </span>
                <span v-else class="text-rose-400"> {{ deviceTest.snmp?.outcome }}: {{ deviceTest.snmp?.error }}</span>
              </div>
              <table v-if="deviceTest.snmp?.raw?.length" class="mt-2 w-full">
                <tbody>
                  <tr v-for="r in deviceTest.snmp.raw" :key="r.oid" class="align-top">
                    <td class="whitespace-nowrap pr-3 font-mono text-faint">{{ r.name || r.oid }}</td>
                    <td class="pr-3 text-faint">{{ r.type }}</td>
                    <td class="break-all font-mono">{{ r.value ?? 'null' }}</td>
                  </tr>
                </tbody>
              </table>
            </template>
          </div>
        </div>

        <div class="panel p-4">
          <h2 class="mb-3 font-semibold">Placement & scheduling</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Location">
              <USelect v-model="settingsForm.location_id" :items="locations" class="w-full" />
            </UFormField>
            <UFormField label="Poller group"><UInput v-model.number="settingsForm.poller_group" type="number" class="w-full" /></UFormField>
            <UFormField label="Port association mode">
              <USelect v-model="settingsForm.port_association_mode" :items="assocItems" class="w-full" />
            </UFormField>
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Poll interval (s)"><UInput v-model.number="settingsForm.poll_interval_seconds" type="number" placeholder="default" class="w-full" /></UFormField>
              <UFormField label="Discovery interval (s)"><UInput v-model.number="settingsForm.discovery_interval_seconds" type="number" placeholder="default" class="w-full" /></UFormField>
            </div>
          </div>
        </div>

        <div class="panel p-4">
          <h2 class="mb-3 font-semibold">Availability & alerting</h2>
          <div class="space-y-2">
            <UCheckbox v-model="settingsForm.disabled" label="Disabled — stop polling and discovery entirely" />
            <UCheckbox v-model="settingsForm.ignored" label="Ignored — keep polling but exclude from alerting/availability" />
          </div>
          <div class="mt-4">
            <UFormField label="Depends on (parent devices)"
              description="When every parent is down, this device's alerts are suppressed as collateral">
              <div class="flex items-center gap-2">
                <USelectMenu v-model="parentIds" :items="depDevices" value-key="value" multiple searchable class="grow" placeholder="No parents" />
                <UButton size="sm" variant="soft" :loading="savingDeps" @click="saveDependencies">Save</UButton>
              </div>
            </UFormField>
          </div>
        </div>

        <div v-if="moduleRegistry.discovery.length || moduleRegistry.poll.length" class="panel p-4">
          <h2 class="mb-1 font-semibold">Collection modules (this device)</h2>
          <p class="mb-3 text-xs text-muted">Overrides for this device only — "inherit" follows group/OS/global settings. Applies from the next discovery/poll.</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <div v-for="phase in ['discovery', 'poll']" :key="phase">
              <h3 class="mb-1.5 text-xs font-semibold uppercase text-faint">{{ phase }}</h3>
              <div class="space-y-1">
                <div v-for="m in moduleRegistry[phase]" :key="m.name" class="flex items-center justify-between">
                  <span class="text-sm">{{ m.name }}<span v-if="!m.default_enabled" class="ml-1 text-[10px] text-faint">(off by default)</span></span>
                  <USelect :model-value="moduleState(phase, m.name)" :items="moduleStateItems" size="xs" class="w-24"
                    @update:model-value="(v) => setModuleState(phase, m.name, v)" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <UButton color="error" variant="soft" icon="i-lucide-trash-2" @click="deleteDevice">Delete device</UButton>
          <UButton icon="i-lucide-save" :loading="saving" @click="saveSettings">Save changes</UButton>
        </div>
      </div>
    </div>
  </div>
</template>
