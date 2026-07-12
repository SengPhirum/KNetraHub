<script setup lang="ts">
const route = useRoute()
const { hasApp } = useAuth()

const { data: device, status, refresh } = useAsyncData(`netDevice-${route.params.id}`, () => $fetch(`/api/net/devices/${route.params.id}`))
const { data: backups } = useAsyncData(`netDeviceBackups-${route.params.id}`, () => $fetch(`/api/net/devices/${route.params.id}/backups`))
const { data: groups } = useAsyncData('netGroupsForDeviceForm', () => $fetch<any[]>('/api/net/groups'), { default: () => [] as any[] })
const groupSelectItems = computed(() => [{ value: '', label: 'No group' }, ...(groups.value || []).map((g: any) => ({ value: g.id, label: g.name }))])

const activeTab = ref('overview')
const tabs = [
  { id: 'overview', label: 'Overview', icon: 'i-lucide-activity' },
  { id: 'ports', label: 'Ports', icon: 'i-lucide-ethernet-port' },
  { id: 'sensors', label: 'Sensors', icon: 'i-lucide-thermometer' },
  { id: 'backups', label: 'Backups', icon: 'i-lucide-history' },
  { id: 'settings', label: 'Settings', icon: 'i-lucide-settings' }
]

const settingsForm = reactive({
  hostname: '',
  ip: '',
  poll_method: '',
  snmp_version: '',
  snmp_community: '',
  category: '',
  type: 'Unknown',
  group_id: '',
  ...defaultSnmpV3()
})

watch(device, (val) => {
  if (val) {
    const v3 = defaultSnmpV3()
    Object.assign(settingsForm, {
      hostname: val.hostname,
      ip: val.ip,
      poll_method: val.poll_method,
      snmp_version: val.snmp_version,
      // Stored credentials are never returned by the API - blank means "keep
      // the current value" on save (the server COALESCEs blanks away).
      snmp_community: '',
      category: val.category,
      type: val.type || 'Unknown',
      group_id: val.group_id || '',
      // Fall back to v3 defaults so the selects always have a valid value even
      // for devices created before SNMPv3 support (null columns).
      snmp_sec_level: val.snmp_sec_level || v3.snmp_sec_level,
      snmp_auth_user: val.snmp_auth_user || v3.snmp_auth_user,
      snmp_auth_protocol: val.snmp_auth_protocol || v3.snmp_auth_protocol,
      snmp_auth_password: '',
      snmp_priv_protocol: val.snmp_priv_protocol || v3.snmp_priv_protocol,
      snmp_priv_password: ''
    })
  }
}, { immediate: true })

const saving = ref(false)
async function saveSettings() {
  saving.value = true
  try {
    await $fetch(`/api/net/devices/${route.params.id}`, { method: 'PUT', body: settingsForm })
    await $fetch(`/api/net/devices/${route.params.id}/group`, { method: 'PUT', body: { group_id: settingsForm.group_id || null } })
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- Latency history (real data from the net_metrics hypertable) ------------
const latencyRange = ref('6h')
const rangeItems = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' }
]
const { data: metrics } = useAsyncData(
  `netDeviceMetrics-${route.params.id}`,
  () => $fetch<any>(`/api/net/metrics?device=${route.params.id}&range=${latencyRange.value}`),
  { watch: [latencyRange], default: () => ({ series: { latency: [] } }) }
)
const latencyPoints = computed<any[]>(() => metrics.value?.series?.latency || [])
const latencyLabels = computed(() => latencyPoints.value.map((p) => fmtTime(p.time)))
const latencyDatasets = computed(() => [
  { label: 'Avg', data: latencyPoints.value.map((p) => p.avgMs), color: '#34d399' },
  { label: 'Max', data: latencyPoints.value.map((p) => p.maxMs), color: '#f59e0b' }
])
function fmtTime(t: string) {
  return latencyRange.value === '7d'
    ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// --- Status presentation + pause/resume monitoring --------------------------
function statusBorder(s: string) {
  return s === 'up' ? 'border-b-emerald-500'
    : s === 'paused' ? 'border-b-amber-500'
    : s === 'down' ? 'border-b-rose-500'
    : 'border-b-surface'
}
const toggling = ref(false)
async function toggleMonitoring() {
  if (!device.value) return
  toggling.value = true
  try {
    await $fetch(`/api/net/devices/${route.params.id}/monitoring`, {
      method: 'POST',
      body: { enabled: device.value.monitoring_enabled === false }
    })
    await refresh()
  } finally {
    toggling.value = false
  }
}

// --- Backups ----------------------------------------------------------------
function downloadBackup(backup: any) {
  const blob = new Blob([backup.config_text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${device.value?.hostname || 'device'}-${backup.timestamp.replace(/[:.]/g, '-')}.cfg`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div>
    <PageHeader :title="device?.hostname || 'Loading...'" subtitle="Device Management" icon="i-lucide-hard-drive">
      <template #actions>
        <div class="flex items-center gap-3">
          <UButton
            v-if="hasApp('monitoring') && device"
            size="sm"
            variant="soft"
            :color="device.monitoring_enabled === false ? 'success' : 'neutral'"
            :icon="device.monitoring_enabled === false ? 'i-lucide-play' : 'i-lucide-pause'"
            :loading="toggling"
            @click="toggleMonitoring"
          >{{ device.monitoring_enabled === false ? 'Resume' : 'Pause' }}</UButton>
          <NuxtLink to="/monitoring/network/devices" class="text-sm font-medium text-(--color-muted) hover:text-foam flex items-center gap-1">
            <UIcon name="i-lucide-arrow-left" class="size-4" /> Back to Inventory
          </NuxtLink>
        </div>
      </template>
    </PageHeader>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else-if="device" class="space-y-6">
      
      <!-- Device Header Card -->
      <div class="panel p-5 grid grid-cols-2 md:grid-cols-5 gap-6 border-b-4 border-b-surface" :class="statusBorder(device.status)">
        <div>
          <span class="text-xs font-medium uppercase text-(--color-muted)">IP Address</span>
          <p class="mt-1 font-mono text-sm text-foam">{{ device.ip }}</p>
        </div>
        <div>
          <span class="text-xs font-medium uppercase text-(--color-muted)">Vendor & OS</span>
          <p class="mt-1 text-sm text-foam">{{ device.vendor }} / {{ device.os }}</p>
        </div>
        <div class="col-span-2">
          <span class="text-xs font-medium uppercase text-(--color-muted)">System Name</span>
          <p class="mt-1 text-sm text-foam truncate" :title="device.sys_descr">{{ device.sys_name || 'N/A' }}</p>
        </div>
        <div>
          <span class="text-xs font-medium uppercase text-(--color-muted)">Uptime</span>
          <p class="mt-1 text-sm text-foam">{{ device.uptime }}</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-surface">
        <button v-for="tab in tabs" :key="tab.id" @click="activeTab = tab.id"
          class="px-4 py-2.5 text-sm font-medium transition-colors border-b-2 flex items-center gap-2"
          :class="activeTab === tab.id ? 'border-primary-500 text-foam' : 'border-transparent text-(--color-muted) hover:text-foam'">
          <UIcon :name="tab.icon" class="size-4" />
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab Content: Overview -->
      <div v-if="activeTab === 'overview'" class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="panel p-5">
            <h3 class="font-medium text-foam mb-3">System Information</h3>
            <dl class="space-y-2 text-sm">
              <div class="flex justify-between border-b border-surface pb-1"><dt class="text-faint">ObjectID</dt><dd class="text-foam font-mono">{{ device.sys_object_id || 'Unknown' }}</dd></div>
              <div class="flex justify-between border-b border-surface pb-1"><dt class="text-faint">Category</dt><dd class="text-foam">{{ categoryLabel(device.category) }}</dd></div>
              <div class="flex justify-between border-b border-surface pb-1"><dt class="text-faint">Poll Method</dt><dd class="text-foam uppercase">{{ device.poll_method }}</dd></div>
              <div class="flex justify-between border-b border-surface pb-1"><dt class="text-faint">Monitoring</dt><dd :class="device.monitoring_enabled === false ? 'text-amber-500' : 'text-emerald-500'">{{ device.monitoring_enabled === false ? 'Paused' : 'Active' }}</dd></div>
              <div class="flex justify-between pb-1"><dt class="text-faint">Description</dt><dd class="text-foam truncate max-w-xs" :title="device.sys_descr">{{ device.sys_descr || 'Unknown' }}</dd></div>
            </dl>
          </div>
          <div class="panel p-5">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-medium text-foam">ICMP Latency</h3>
              <USelect v-model="latencyRange" :items="rangeItems" value-key="value" label-key="label" size="xs" class="w-24" />
            </div>
            <div v-if="!latencyPoints.length" class="flex h-50 items-center justify-center text-center text-sm text-faint">
              No latency history yet — it fills in as the poller runs.
            </div>
            <MetricsChart
              v-else
              :labels="latencyLabels"
              :datasets="latencyDatasets"
              :height="200"
              fill
              :format-value="(n: number) => `${n} ms`"
              y-title="ms"
            />
          </div>
        </div>
      </div>

      <!-- Tab Content: Ports -->
      <div v-if="activeTab === 'ports'" class="panel">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-(--color-muted)">
            <thead class="bg-surface-2 text-xs uppercase text-faint">
              <tr>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium">Port</th>
                <th class="px-4 py-3 font-medium">MAC / Type</th>
                <th class="px-4 py-3 font-medium">Speed</th>
                <th class="px-4 py-3 font-medium">In Traffic</th>
                <th class="px-4 py-3 font-medium">Out Traffic</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-if="!device.interfaces?.length">
                <td colspan="6" class="px-4 py-8 text-center text-faint">No interfaces discovered.</td>
              </tr>
              <tr v-for="iface in device.interfaces" :key="iface.id" class="hover:bg-surface-2/50 transition">
                <td class="px-4 py-3">
                  <div class="flex flex-col gap-1">
                    <span class="flex items-center gap-1.5 text-xs"><span class="size-2 rounded-full" :class="iface.admin_status === 'up' ? 'bg-green-500' : 'bg-red-500'"></span> Admin</span>
                    <span class="flex items-center gap-1.5 text-xs"><span class="size-2 rounded-full" :class="iface.oper_status === 'up' ? 'bg-green-500' : 'bg-red-500'"></span> Oper</span>
                  </div>
                </td>
                <td class="px-4 py-3 font-mono text-foam font-medium">{{ iface.name }}</td>
                <td class="px-4 py-3 text-xs">
                  <div class="font-mono text-foam">{{ iface.mac_address || 'N/A' }}</div>
                  <div class="text-faint">{{ iface.type }} / MTU: {{ iface.mtu }}</div>
                </td>
                <td class="px-4 py-3">{{ iface.speed }}</td>
                <td class="px-4 py-3 text-green-400">{{ iface.in_traffic }}</td>
                <td class="px-4 py-3 text-blue-400">{{ iface.out_traffic }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tab Content: Sensors -->
      <div v-if="activeTab === 'sensors'" class="space-y-6">
        <div v-if="!device.sensors?.length" class="panel p-8 text-center text-faint">
          No hardware sensors discovered for this device.
        </div>
        <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div v-for="sensor in device.sensors" :key="sensor.id" class="panel p-4 flex flex-col justify-between">
            <div class="flex items-start justify-between mb-2">
              <span class="text-xs text-(--color-muted) font-medium uppercase">{{ sensor.sensor_type }}</span>
              <UIcon :name="sensor.sensor_type === 'temperature' ? 'i-lucide-thermometer' : sensor.sensor_type === 'fan' ? 'i-lucide-fan' : 'i-lucide-zap'" class="size-4 text-faint" />
            </div>
            <div class="text-sm text-foam mb-3 truncate" :title="sensor.name">{{ sensor.name }}</div>
            <div class="flex items-end gap-1">
              <span class="text-2xl font-display font-semibold" :class="sensor.current_value > sensor.limit_high ? 'text-red-500' : 'text-green-500'">{{ sensor.current_value }}</span>
              <span class="text-xs text-faint mb-1">{{ sensor.unit }}</span>
            </div>
            <div class="w-full bg-surface-2 h-1 mt-3 rounded overflow-hidden">
              <div class="h-full bg-primary-500" :style="{ width: Math.max(0, Math.min(((sensor.current_value / (sensor.limit_high || 1)) * 100) || 0, 100)) + '%' }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab Content: Backups -->
      <div v-if="activeTab === 'backups'" class="space-y-6">
        <div v-if="!backups?.length" class="panel p-8 text-center text-faint">
          No backups discovered for this device.
        </div>
        <div v-else class="space-y-4">
          <div v-for="backup in backups" :key="backup.id" class="panel p-5">
            <div class="flex justify-between mb-3 border-b border-surface pb-3">
              <div>
                <div class="font-medium text-foam">Configuration Backup</div>
                <div class="text-xs text-faint mt-1">{{ new Date(backup.timestamp).toLocaleString() }}</div>
              </div>
              <UButton size="xs" variant="ghost" icon="i-lucide-download" @click="downloadBackup(backup)">Download</UButton>
            </div>
            <pre class="text-xs font-mono text-(--color-muted) whitespace-pre-wrap max-h-64 overflow-y-auto bg-surface-2 p-3 rounded">{{ backup.config_text }}</pre>
          </div>
        </div>
      </div>

      <!-- Tab Content: Settings -->
      <div v-if="activeTab === 'settings'" class="panel p-6 max-w-2xl">
        <h3 class="text-lg font-semibold text-foam mb-6">Device Configuration</h3>
        <div class="space-y-4">
          <UFormField label="Hostname">
            <UInput v-model="settingsForm.hostname" class="w-full" />
          </UFormField>
          <UFormField label="IP Address">
            <UInput v-model="settingsForm.ip" class="w-full" />
          </UFormField>
          <UFormField label="Category">
            <USelect v-model="settingsForm.category" :items="CATEGORY_SELECT_ITEMS" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Device Type">
            <USelect v-model="settingsForm.type" :items="DEVICE_TYPE_SELECT_ITEMS" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Group">
            <USelect v-model="settingsForm.group_id" :items="groupSelectItems" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <div class="pt-4 border-t border-surface space-y-4">
            <UFormField label="Polling Method">
              <USelect v-model="settingsForm.poll_method" :items="[{value:'snmp', label:'SNMP'}, {value:'ping', label:'Ping Only'}]" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <template v-if="settingsForm.poll_method === 'snmp'">
              <NetSnmpFields :form="settingsForm" keep-blank />
            </template>
          </div>
          <div class="pt-6 flex justify-end">
            <UButton color="primary" :loading="saving" @click="saveSettings">Save Changes</UButton>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
