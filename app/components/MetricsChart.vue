<script setup lang="ts">
import {
  Chart as ChartJS,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'vue-chartjs'

ChartJS.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)

// labels are pre-formatted strings (e.g. "14:32") rather than raw Date/ISO
// values, so a category scale is enough and we avoid pulling in a Chart.js
// date adapter dependency just for axis ticks.
const props = defineProps<{
  labels: string[]
  datasets: { label: string; data: (number | null)[]; color?: string }[]
  formatValue?: (n: number) => string
  height?: number
  fill?: boolean
  legend?: boolean
  yTitle?: string
}>()

const palette = ['#2496ED', '#34d399', '#f59e0b', '#a78bfa']

function withAlpha(color: string, alpha: number) {
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
    const value = Number.parseInt(full, 16)
    const r = (value >> 16) & 255
    const g = (value >> 8) & 255
    const b = value & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.datasets.map((d, i) => {
    const color = d.color || palette[i % palette.length]
    return {
      label: d.label,
      data: d.data,
      borderColor: color,
      backgroundColor: props.fill ? withAlpha(color, 0.22) : 'transparent',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.25,
      fill: props.fill ? 'origin' : false
    }
  })
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    x: { ticks: { color: '#8a99b0', maxRotation: 0, autoSkip: true }, grid: { color: 'rgba(138,153,176,0.1)' } },
    y: {
      title: {
        display: Boolean(props.yTitle),
        text: props.yTitle,
        color: '#8a99b0'
      },
      ticks: {
        color: '#8a99b0',
        callback: (value: any) => (props.formatValue ? props.formatValue(Number(value)) : value)
      },
      grid: { color: 'rgba(138,153,176,0.1)' }
    }
  },
  plugins: {
    legend: { display: props.legend !== false && props.datasets.length > 1, labels: { color: '#8a99b0' } },
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
