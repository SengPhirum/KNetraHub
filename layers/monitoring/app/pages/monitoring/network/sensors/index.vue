<script setup lang="ts">
const { hasApp } = useAuth()

const { data: sensors, status, refresh } = useAsyncData('netSensors', () => $fetch('/api/net/sensors'), {
  server: false
})

const { connected } = useMonitoringEvents((evt) => { if (evt.type === 'net') refresh() })
const pageVisibility = useDocumentVisibility()
useIntervalFn(() => { if (!connected.value && pageVisibility.value === 'visible') refresh() }, 10000, { immediate: false })

const search = ref('')
const typeFilter = ref('all')

// Export-only: sensors are derived from device polling, not hand-configured,
// so there's nothing meaningful to "import" back into them.
const SENSOR_CSV_COLUMNS = ['device_name', 'device_ip', 'name', 'sensor_type', 'current_value', 'unit', 'limit_low', 'limit_high']
async function exportSensors(format: 'json' | 'csv') {
  const data = await $fetch<any[]>('/api/net/sensors/export')
  if (format === 'json') downloadJson(exportFilename('sensors', 'json'), data)
  else downloadText(exportFilename('sensors', 'csv'), toCsv(data, SENSOR_CSV_COLUMNS), 'text/csv')
}
const exportMenu = [[
  { label: 'Export as JSON', icon: 'i-lucide-file-json', onSelect: () => exportSensors('json') },
  { label: 'Export as CSV', icon: 'i-lucide-file-spreadsheet', onSelect: () => exportSensors('csv') }
]]

// PRTG-style state derived from the device + the sensor's configured limits:
// Paused (monitoring off) / Down (device down or reading out of limits) /
// Warning (near the high limit) / Up. Null/absent limits mean "no bound".
type SensorState = 'paused' | 'down' | 'warning' | 'up'
function sensorState(s: any): SensorState {
  if (s.monitoring_enabled === false || s.device_status === 'paused') return 'paused'
  if (s.device_status === 'down') return 'down'
  const v = Number(s.current_value)
  const hi = s.limit_high == null ? null : Number(s.limit_high)
  const lo = s.limit_low == null ? null : Number(s.limit_low)
  if (hi != null && hi > 0 && v > hi) return 'down'
  if (lo != null && v < lo) return 'down'
  if (hi != null && hi > 0 && v >= hi * 0.9) return 'warning'
  return 'up'
}

const STATE_META: Record<SensorState, { label: string; color: 'success' | 'warning' | 'error' | 'neutral'; text: string; bar: string }> = {
  up:      { label: 'Up',      color: 'success', text: 'text-green-500',  bar: 'bg-green-500' },
  warning: { label: 'Warning', color: 'warning', text: 'text-orange-500', bar: 'bg-orange-500' },
  down:    { label: 'Down',    color: 'error',   text: 'text-red-500',    bar: 'bg-red-500' },
  paused:  { label: 'Paused',  color: 'neutral', text: 'text-faint',      bar: 'bg-slate-500' }
}

const sensorTypes = computed(() => {
  const set = new Set<string>()
  for (const s of sensors.value || []) set.add(s.sensor_type)
  return ['all', ...Array.from(set).sort()]
})

// Attach the derived state once so the template doesn't recompute it per cell.
const rows = computed(() => {
  let list = (sensors.value || []).map((s: any) => ({ ...s, _state: sensorState(s) }))
  if (typeFilter.value !== 'all') list = list.filter((s: any) => s.sensor_type === typeFilter.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter((s: any) => s.name.toLowerCase().includes(q) || s.device_name.toLowerCase().includes(q))
  }
  return list
})

const summary = computed(() => {
  const list = sensors.value || []
  let up = 0, warning = 0, down = 0, paused = 0
  for (const s of list) {
    const st = sensorState(s)
    if (st === 'up') up++
    else if (st === 'warning') warning++
    else if (st === 'paused') paused++
    else down++
  }
  return { total: list.length, up, warning, down, paused }
})

function loadWidth(s: any) {
  if (!s.limit_high) return 0
  return Math.max(0, Math.min(((s.current_value / s.limit_high) * 100) || 0, 100))
}

const typeIcon: Record<string, string> = {
  temperature: 'i-lucide-thermometer',
  fan: 'i-lucide-fan',
  voltage: 'i-lucide-zap',
  power: 'i-lucide-plug',
  humidity: 'i-lucide-droplets',
  ping: 'i-lucide-radio',
  traffic: 'i-lucide-arrow-left-right'
}
</script>

<template>
  <div>
    <PageHeader title="Sensors" subtitle="Every monitored measurement across the fleet — click a sensor for its history graph" icon="i-lucide-gauge">
      <template v-if="hasApp('monitoring')" #actions>
        <UDropdownMenu :items="exportMenu" :content="{ align: 'end' }">
          <UButton icon="i-lucide-download" color="neutral" variant="soft" size="sm">Export</UButton>
        </UDropdownMenu>
      </template>
    </PageHeader>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="space-y-6">
      <div class="grid gap-4 grid-cols-2 sm:grid-cols-5">
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Total Sensors</span>
          <span class="mt-2 text-3xl font-bold text-foam">{{ summary.total }}</span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Up</span>
          <span class="mt-2 text-3xl font-bold text-green-500">{{ summary.up }}</span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Warning</span>
          <span class="mt-2 text-3xl font-bold text-orange-500">{{ summary.warning }}</span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Down</span>
          <span class="mt-2 text-3xl font-bold text-red-500">{{ summary.down }}</span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Paused</span>
          <span class="mt-2 text-3xl font-bold text-faint">{{ summary.paused }}</span>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 items-center">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search sensor or device..." class="w-full sm:w-72" />
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="t in sensorTypes" :key="t"
            class="rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors"
            :class="typeFilter === t ? 'bg-beacon/15 text-beacon ring-1 ring-inset ring-beacon/30' : 'text-(--color-muted) hover:bg-surface-2'"
            @click="typeFilter = t"
          >{{ t }}</button>
        </div>
      </div>

      <div class="panel">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-(--color-muted)">
            <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
              <tr>
                <th class="px-4 py-3 font-medium">State</th>
                <th class="px-4 py-3 font-medium">Sensor</th>
                <th class="px-4 py-3 font-medium">Device</th>
                <th class="px-4 py-3 font-medium">Reading</th>
                <th class="px-4 py-3 font-medium">Range</th>
                <th class="px-4 py-3 font-medium w-40">Load</th>
                <th class="px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-if="status === 'pending' && !sensors" class="animate-pulse">
                <td colspan="7" class="px-4 py-8 text-center text-faint">Loading sensors...</td>
              </tr>
              <tr v-else-if="rows.length === 0">
                <td colspan="7" class="px-4 py-8 text-center text-faint">No sensors found.</td>
              </tr>
              <tr
                v-for="s in rows" :key="s.id"
                class="hover:bg-surface-2/50 transition cursor-pointer"
                @click="navigateTo(`/monitoring/network/sensors/${s.id}`)"
              >
                <td class="px-4 py-3">
                  <UBadge size="xs" variant="soft" :color="STATE_META[s._state].color">{{ STATE_META[s._state].label }}</UBadge>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <UIcon :name="typeIcon[s.sensor_type] || 'i-lucide-activity'" class="size-4 text-faint shrink-0" />
                    <NuxtLink :to="`/monitoring/network/sensors/${s.id}`" class="font-medium text-foam hover:text-beacon transition" @click.stop>{{ s.name }}</NuxtLink>
                  </div>
                  <div class="text-xs text-faint uppercase mt-0.5">{{ s.sensor_type }}</div>
                </td>
                <td class="px-4 py-3">
                  <NuxtLink :to="`/monitoring/network/devices/${s.device_id}`" class="text-foam hover:text-beacon transition" @click.stop>{{ s.device_name }}</NuxtLink>
                  <div class="font-mono text-xs text-faint">{{ s.device_ip }}</div>
                </td>
                <td class="px-4 py-3">
                  <span class="font-display text-base font-semibold" :class="STATE_META[s._state].text">{{ s.current_value }}</span>
                  <span class="text-xs text-faint ml-1">{{ s.unit }}</span>
                </td>
                <td class="px-4 py-3 text-xs font-mono">{{ s.limit_low ?? '—' }} – {{ s.limit_high ?? '∞' }} {{ s.unit }}</td>
                <td class="px-4 py-3">
                  <div class="w-full bg-surface-2 h-1.5 rounded overflow-hidden">
                    <div class="h-full transition-all" :class="STATE_META[s._state].bar" :style="{ width: loadWidth(s) + '%' }"></div>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <UIcon name="i-lucide-chevron-right" class="size-4 text-faint" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
