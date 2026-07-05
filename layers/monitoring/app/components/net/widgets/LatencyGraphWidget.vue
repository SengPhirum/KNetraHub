<script setup lang="ts">
import type { Widget } from '~~/layers/monitoring/app/utils/netDashboards'

const props = defineProps<{ widget: Widget }>()
const range = computed<string>(() => props.widget.config?.range || '6h')

const { data } = useAsyncData(
  () => `net-metrics-latency-${range.value}`,
  () => $fetch<any>(`/api/net/metrics?range=${range.value}`),
  { watch: [range], default: () => ({ series: { latency: [] } }) }
)

const points = computed<any[]>(() => data.value?.series?.latency || [])
const labels = computed(() => points.value.map((p) => fmtTime(p.time)))
const datasets = computed(() => [
  { label: 'Avg', data: points.value.map((p) => p.avgMs), color: '#2496ED' },
  { label: 'Max', data: points.value.map((p) => p.maxMs), color: '#a78bfa' }
])
const chartHeight = computed(() => Math.max(120, props.widget.h * 60 - 84))

function fmtTime(t: string) {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div v-if="!points.length" class="flex flex-1 items-center justify-center text-center text-sm text-faint">
      No latency history yet — it fills in as the poller runs.
    </div>
    <MetricsChart
      v-else
      :labels="labels"
      :datasets="datasets"
      :height="chartHeight"
      fill
      :format-value="(n: number) => `${n} ms`"
      y-title="ms"
    />
  </div>
</template>
