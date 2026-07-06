<script setup lang="ts">
import { Chart as ChartJS, ArcElement, Tooltip, Legend, DoughnutController } from 'chart.js'
import { Doughnut } from 'vue-chartjs'

ChartJS.register(ArcElement, Tooltip, Legend, DoughnutController)

const devices = useNetData('net-devices', '/api/net/devices')

const counts = computed(() => {
  const d = devices.value || []
  return {
    up: d.filter((x: any) => x.status === 'up').length,
    down: d.filter((x: any) => x.status === 'down').length,
    unknown: d.filter((x: any) => x.status !== 'up' && x.status !== 'down').length
  }
})

const total = computed(() => counts.value.up + counts.value.down + counts.value.unknown)

const chartData = computed(() => ({
  labels: ['Up', 'Down', 'Unknown'],
  datasets: [{
    data: [counts.value.up, counts.value.down, counts.value.unknown],
    backgroundColor: ['#34d399', '#f43f5e', '#64748b'],
    borderColor: 'transparent',
    borderWidth: 0
  }]
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '68%',
  plugins: {
    legend: { position: 'bottom' as const, labels: { color: '#8a99b0', boxWidth: 12, padding: 12 } }
  }
}
</script>

<template>
  <div class="relative h-full min-h-40">
    <Doughnut v-if="total > 0" :data="chartData" :options="chartOptions" />
    <div v-else class="flex h-full items-center justify-center text-sm text-faint">No devices</div>
    <div v-if="total > 0" class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-[calc(50%+14px)] text-center">
      <div class="font-display text-2xl font-bold text-foam">{{ total }}</div>
      <div class="text-[10px] uppercase tracking-wider text-faint">Devices</div>
    </div>
  </div>
</template>
