<script setup lang="ts">
import {
  Chart as ChartJS,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
} from 'chart.js'
import { Line } from 'vue-chartjs'

ChartJS.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend)

// labels are pre-formatted strings (e.g. "14:32") rather than raw Date/ISO
// values, so a category scale is enough and we avoid pulling in a Chart.js
// date adapter dependency just for axis ticks.
const props = defineProps<{
  labels: string[]
  datasets: { label: string; data: (number | null)[]; color?: string }[]
  formatValue?: (n: number) => string
  height?: number
}>()

const palette = ['#2496ED', '#34d399', '#f59e0b', '#a78bfa']

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map((d, i) => ({
    label: d.label,
    data: d.data,
    borderColor: d.color || palette[i % palette.length],
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0.25
  }))
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    x: { ticks: { color: '#8a99b0', maxRotation: 0, autoSkip: true }, grid: { color: 'rgba(138,153,176,0.1)' } },
    y: {
      ticks: {
        color: '#8a99b0',
        callback: (value: any) => (props.formatValue ? props.formatValue(Number(value)) : value)
      },
      grid: { color: 'rgba(138,153,176,0.1)' }
    }
  },
  plugins: {
    legend: { display: props.datasets.length > 1, labels: { color: '#8a99b0' } },
    tooltip: {
      callbacks: {
        label: (ctx: any) => {
          const value = ctx.parsed.y
          return `${ctx.dataset.label}: ${props.formatValue ? props.formatValue(value) : value}`
        }
      }
    }
  }
}))
</script>

<template>
  <div :style="{ height: (height || 220) + 'px' }">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>
