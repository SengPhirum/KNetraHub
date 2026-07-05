<script setup lang="ts">
// PRTG-style sensor detail: the sensor "collects" a current value; this page
// "visualizes" its history as a graph over time (per channel), with the sensor's
// limit thresholds drawn on it. Data is real — from the net_sensor_readings
// hypertable via /api/net/sensors/[id]/metrics.
const { hasApp } = useAuth()
const route = useRoute()

const { data: sensor, refresh: refreshSensor } = useAsyncData(
  `sensor-${route.params.id}`,
  () => $fetch<any>(`/api/net/sensors/${route.params.id}`),
  { server: false }
)

const range = ref('6h')
const rangeItems = [
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' }
]
const { data: metrics, refresh: refreshMetrics } = useAsyncData(
  `sensorMetrics-${route.params.id}`,
  () => $fetch<any>(`/api/net/sensors/${route.params.id}/metrics?range=${range.value}`),
  { watch: [range], server: false, default: () => ({ channels: [], buckets: [], series: {}, coveragePercent: 0 }) }
)

onMounted(() => {
  const t = setInterval(() => { refreshSensor(); refreshMetrics() }, 30000)
  onUnmounted(() => clearInterval(t))
})

// State (mirrors the list, plus PRTG's "Unusual" when the latest reading
// deviates from the sensor's own recent baseline — see the metrics endpoint).
type SensorState = 'paused' | 'down' | 'warning' | 'up' | 'unusual'
function baseState(s: any): Exclude<SensorState, 'unusual'> {
  if (!s) return 'up'
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
const state = computed<SensorState>(() => {
  const b = baseState(sensor.value)
  return b === 'up' && metrics.value?.unusual ? 'unusual' : b
})
const STATE_META: Record<SensorState, { label: string; color: 'success' | 'warning' | 'error' | 'neutral' | 'info'; text: string; icon: string }> = {
  up:      { label: 'Up',      color: 'success', text: 'text-green-500',  icon: 'i-lucide-circle-check' },
  warning: { label: 'Warning', color: 'warning', text: 'text-orange-500', icon: 'i-lucide-triangle-alert' },
  down:    { label: 'Down',    color: 'error',   text: 'text-red-500',    icon: 'i-lucide-circle-x' },
  paused:  { label: 'Paused',  color: 'neutral', text: 'text-faint',      icon: 'i-lucide-pause' },
  unusual: { label: 'Unusual', color: 'info',    text: 'text-sky-400',    icon: 'i-lucide-activity' }
}

const typeIcon: Record<string, string> = {
  temperature: 'i-lucide-thermometer', fan: 'i-lucide-fan', voltage: 'i-lucide-zap',
  power: 'i-lucide-plug', humidity: 'i-lucide-droplets', ping: 'i-lucide-radio',
  traffic: 'i-lucide-arrow-left-right'
}

const CHANNEL_META: Record<string, { label: string; color: string }> = {
  value: { label: 'Value', color: '#34d399' },
  in: { label: 'Traffic In', color: '#2496ED' },
  out: { label: 'Traffic Out', color: '#f59e0b' }
}

const unit = computed(() => metrics.value?.unit ?? sensor.value?.unit ?? '')
const hasHistory = computed(() => (metrics.value?.buckets || []).length > 0)

function fmtTime(t: string) {
  return range.value === '7d'
    ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
const chartLabels = computed(() => (metrics.value?.buckets || []).map(fmtTime))
const chartDatasets = computed(() => {
  const m = metrics.value
  if (!m) return []
  const ds = (m.channels || []).map((ch: string) => ({
    label: CHANNEL_META[ch]?.label || ch,
    data: m.series[ch] || [],
    color: CHANNEL_META[ch]?.color
  }))
  const n = (m.buckets || []).length
  if (m.limitHigh != null && m.limitHigh > 0) ds.push({ label: 'Error limit', data: Array(n).fill(m.limitHigh), color: '#f87171' })
  if (m.limitLow != null && m.limitLow > 0) ds.push({ label: 'Lower limit', data: Array(n).fill(m.limitLow), color: '#64748b' })
  return ds
})

function relTime(iso: string | null) {
  if (!iso) return '—'
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
</script>

<template>
  <div>
    <NuxtLink to="/monitoring/network/sensors" class="mb-3 inline-flex items-center gap-1 text-sm text-(--color-muted) hover:text-foam transition">
      <UIcon name="i-lucide-arrow-left" class="size-4" /> Sensors
    </NuxtLink>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else-if="!sensor" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-search-x" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">Sensor not found.</p>
    </div>

    <div v-else class="space-y-6">
      <!-- Header -->
      <div class="panel p-5 flex flex-wrap items-center gap-4">
        <span class="flex size-11 items-center justify-center rounded-xl bg-beacon/12 ring-1 ring-beacon/25">
          <UIcon :name="typeIcon[sensor.sensor_type] || 'i-lucide-activity'" class="size-6 text-beacon" />
        </span>
        <div class="min-w-0">
          <h1 class="font-display text-lg font-semibold text-foam">{{ sensor.name }}</h1>
          <div class="text-xs text-faint">
            <span class="uppercase">{{ sensor.sensor_type }}</span> ·
            <NuxtLink :to="`/monitoring/network/devices/${sensor.device_id}`" class="hover:text-beacon transition">{{ sensor.device_name }}</NuxtLink>
            <span class="font-mono"> ({{ sensor.device_ip }})</span>
          </div>
        </div>
        <UBadge class="ml-auto" size="lg" variant="soft" :color="STATE_META[state].color" :icon="STATE_META[state].icon">{{ STATE_META[state].label }}</UBadge>
      </div>

      <!-- Stat tiles -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Current reading</span>
          <span class="mt-2 font-display text-3xl font-bold" :class="STATE_META[state].text">
            {{ sensor.current_value ?? '—' }}<span class="text-base text-faint ml-1">{{ unit }}</span>
          </span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Limits</span>
          <span class="mt-2 font-mono text-lg text-foam">{{ sensor.limit_low ?? '—' }} – {{ sensor.limit_high ?? '∞' }}</span>
          <span class="text-xs text-faint">{{ unit }}</span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Coverage</span>
          <span class="mt-2 font-display text-3xl font-bold text-foam">{{ metrics.coveragePercent ?? 0 }}<span class="text-base text-faint">%</span></span>
          <span class="text-xs text-faint">of the {{ range }} window</span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Last scan</span>
          <span class="mt-2 text-lg text-foam">{{ relTime(metrics.lastReadingAt) }}</span>
          <span class="text-xs text-faint">every {{ metrics.scanIntervalSeconds ?? '—' }}s</span>
        </div>
      </div>

      <!-- Historical graph -->
      <div class="panel p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-chart-line" class="size-4 text-beacon" />
            <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">History</h2>
          </div>
          <USelect v-model="range" :items="rangeItems" value-key="value" label-key="label" size="xs" class="w-24" />
        </div>
        <div v-if="!hasHistory" class="flex h-56 items-center justify-center text-center text-sm text-faint">
          No history yet — it fills in as the poller runs.
        </div>
        <MetricsChart
          v-else
          :labels="chartLabels"
          :datasets="chartDatasets"
          :height="280"
          :legend="chartDatasets.length > 1"
          :format-value="(n: number) => `${n} ${unit}`"
          :y-title="unit"
        />
      </div>
    </div>
  </div>
</template>
