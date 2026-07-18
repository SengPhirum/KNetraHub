<script setup lang="ts">
// Time-series graph for a monitored entity, backed by /metrics/query.
// kind=port renders In/Out traffic; sensor/metric render a single series.
// Wraps the portal-wide MetricsChart (Chart.js line) so monitoring graphs
// match the rest of the app.
const props = defineProps<{
  kind: 'port' | 'sensor' | 'metric'
  id: number
  metric?: string
  deviceId?: number
  unit?: 'bps' | 'percent' | 'ms' | 'raw'
  title?: string
  height?: number
}>()

const { formatBits } = useMonitoring()
const range = ref('-24h')
const rangeItems = [
  { value: '-6h', label: '6h' }, { value: '-24h', label: '24h' },
  { value: '-7d', label: '7d' }, { value: '-30d', label: '30d' }
]

const url = computed(() => {
  const p = new URLSearchParams({ kind: props.kind, id: String(props.id), from: range.value })
  if (props.metric) p.set('metric', props.metric)
  if (props.deviceId) p.set('device_id', String(props.deviceId))
  return `/api/monitoring/v1/metrics/query?${p}`
})
const { data, status } = useAsyncData(`monChart:${props.kind}:${props.id}:${props.metric ?? ''}`,
  () => $fetch<any>(url.value),
  { server: false, default: () => null, watch: [url] })

const longRange = computed(() => range.value === '-7d' || range.value === '-30d')
function fmtTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return longRange.value
    ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`
    : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const labels = computed(() => (data.value?.points ?? []).map((p: any) => fmtTime(p.time)))
const datasets = computed(() => {
  const points = data.value?.points ?? []
  if (props.kind === 'port') {
    return [
      { label: 'In', data: points.map((p: any) => p.in_bps != null ? Number(p.in_bps) : null) },
      { label: 'Out', data: points.map((p: any) => p.out_bps != null ? Number(p.out_bps) : null) }
    ]
  }
  return [{ label: props.title ?? 'Value', data: points.map((p: any) => p.value != null ? Number(p.value) : null) }]
})

const formatValue = computed(() => {
  switch (props.unit) {
    case 'bps': return (n: number) => formatBits(n)
    case 'percent': return (n: number) => `${n.toFixed(0)}%`
    case 'ms': return (n: number) => `${n.toFixed(1)} ms`
    default: return (n: number) => String(Math.round(n * 100) / 100)
  }
})
const hasData = computed(() => (data.value?.points?.length ?? 0) > 0)
</script>

<template>
  <div>
    <div class="mb-2 flex items-center gap-2">
      <span v-if="title" class="text-sm font-medium">{{ title }}</span>
      <div class="ml-auto flex gap-1">
        <button v-for="r in rangeItems" :key="r.value"
          :class="['rounded px-2 py-0.5 text-xs', range === r.value ? 'bg-primary/15 text-primary' : 'text-muted hover:text-default']"
          @click="range = r.value">{{ r.label }}</button>
      </div>
    </div>
    <div v-if="status === 'pending'" class="flex items-center justify-center text-sm text-muted" :style="{ height: (height || 220) + 'px' }">
      Loading…
    </div>
    <div v-else-if="!hasData" class="flex items-center justify-center text-sm text-muted" :style="{ height: (height || 220) + 'px' }">
      No samples in this range yet — data appears after the next polls.
    </div>
    <MetricsChart v-else :labels="labels" :datasets="datasets" :format-value="formatValue" :height="height || 220" fill />
  </div>
</template>
