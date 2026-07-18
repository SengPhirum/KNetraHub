<script setup lang="ts">
// Device-level aggregate graph backed by /devices/:id/graphs (traffic, cpu,
// memory, storage, latency, loss, availability, poller). Renders the shared
// Chart.js line; range is either interactive (show-range) or fixed — the
// Graphs/Latency tabs render the same graph at day/week/month side by side.
const props = defineProps<{
  deviceId: number
  graph: 'traffic' | 'cpu' | 'memory' | 'memory_percent' | 'storage' | 'latency' | 'loss' | 'availability' | 'poller'
  range?: string
  title?: string
  height?: number
  showRange?: boolean
}>()

const { formatBits, formatBytes } = useMonitoring()
const range = ref(props.range ?? '-24h')
watch(() => props.range, (r) => { if (r) range.value = r })
const rangeItems = [
  { value: '-6h', label: '6h' }, { value: '-24h', label: '24h' },
  { value: '-7d', label: '7d' }, { value: '-30d', label: '30d' }
]

const url = computed(() =>
  `/api/monitoring/v1/devices/${props.deviceId}/graphs?graph=${props.graph}&from=${range.value}`)
const { data, status } = useAsyncData(`monDeviceGraph:${props.deviceId}:${props.graph}:${props.range ?? 'i'}`,
  () => $fetch<any>(url.value),
  { server: false, default: () => null, watch: [url] })

const rangeHours = computed(() => {
  const m = range.value.match(/^-(\d+)(h|d)$/)
  if (!m) return 24
  return Number(m[1]) * (m[2] === 'd' ? 24 : 1)
})
function fmtTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  if (rangeHours.value > 24 * 32) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (rangeHours.value > 48) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const points = computed(() => data.value?.points ?? [])
const labels = computed(() => points.value.map((p: any) => fmtTime(p.time)))

const num = (v: unknown) => (v == null ? null : Number(v))
const datasets = computed(() => {
  const pts = points.value
  if (props.graph === 'traffic') {
    return [
      { label: 'In', data: pts.map((p: any) => num(p.in_bps)), color: '#34d399' },
      { label: 'Out', data: pts.map((p: any) => num(p.out_bps)), color: '#2496ED' }
    ]
  }
  if (props.graph === 'memory' && data.value?.mode === 'bytes') {
    return [
      { label: 'Used', data: pts.map((p: any) => num(p.used_bytes)), color: '#f43f5e' },
      { label: 'Buffers', data: pts.map((p: any) => num(p.buffered_bytes)), color: '#f59e0b' },
      { label: 'Cached', data: pts.map((p: any) => num(p.cached_bytes)), color: '#eab308' },
      { label: 'Free', data: pts.map((p: any) => num(p.free_bytes)), color: '#34d399' },
      { label: 'Total', data: pts.map((p: any) => num(p.total_bytes)), color: '#94a3b8' }
    ]
  }
  const single: Record<string, [string, string]> = {
    cpu: ['CPU %', '#f59e0b'],
    memory: ['Memory %', '#a78bfa'],
    memory_percent: ['Memory %', '#a78bfa'],
    storage: ['Storage %', '#34d399'],
    latency: ['RTT ms', '#2496ED'],
    loss: ['Loss %', '#f43f5e'],
    availability: ['Availability %', '#34d399'],
    poller: ['Duration s', '#a78bfa']
  }
  const [label, color] = single[props.graph] ?? ['Value', '#2496ED']
  return [{ label, data: pts.map((p: any) => num(p.value)), color }]
})

const formatValue = computed(() => {
  if (props.graph === 'traffic') return (n: number) => formatBits(n)
  if (props.graph === 'memory' && data.value?.mode === 'bytes') return (n: number) => formatBytes(n)
  if (props.graph === 'latency') return (n: number) => `${n.toFixed(1)} ms`
  if (props.graph === 'poller') return (n: number) => `${n.toFixed(1)} s`
  return (n: number) => `${n.toFixed(0)}%`
})
const hasData = computed(() => points.value.length > 0)
</script>

<template>
  <div>
    <div v-if="title || showRange" class="mb-2 flex items-center gap-2">
      <span v-if="title" class="text-sm font-medium">{{ title }}</span>
      <div v-if="showRange" class="ml-auto flex gap-1">
        <button v-for="r in rangeItems" :key="r.value"
          :class="['rounded px-2 py-0.5 text-xs', range === r.value ? 'bg-primary/15 text-primary' : 'text-muted hover:text-default']"
          @click="range = r.value">{{ r.label }}</button>
      </div>
    </div>
    <div v-if="status === 'pending'" class="flex items-center justify-center text-sm text-muted" :style="{ height: (height || 200) + 'px' }">
      Loading…
    </div>
    <div v-else-if="!hasData" class="flex items-center justify-center px-2 text-center text-sm text-muted" :style="{ height: (height || 200) + 'px' }">
      No samples in this range yet.
    </div>
    <MetricsChart v-else :labels="labels" :datasets="datasets" :format-value="formatValue" :height="height || 200" fill />
  </div>
</template>
