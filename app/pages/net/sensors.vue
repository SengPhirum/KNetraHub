<script setup lang="ts">
const { hasApp } = useAuth()

const { data: sensors, status, refresh } = useAsyncData('netSensors', () => $fetch('/api/net/sensors'), {
  server: false
})

onMounted(() => {
  const interval = setInterval(refresh, 10000)
  onUnmounted(() => clearInterval(interval))
})

const search = ref('')
const typeFilter = ref('all')

// OK / Warning / Down derived from the sensor's configured limits.
function sensorState(s: any): 'down' | 'warning' | 'ok' {
  const v = Number(s.current_value), hi = Number(s.limit_high), lo = Number(s.limit_low)
  if (s.device_status === 'down') return 'down'
  if (v > hi || v < lo) return 'down'
  if (Number.isFinite(hi) && hi > 0 && v >= hi * 0.9) return 'warning'
  return 'ok'
}

const sensorTypes = computed(() => {
  const set = new Set<string>()
  for (const s of sensors.value || []) set.add(s.sensor_type)
  return ['all', ...Array.from(set).sort()]
})

const filtered = computed(() => {
  let list = sensors.value || []
  if (typeFilter.value !== 'all') list = list.filter((s: any) => s.sensor_type === typeFilter.value)
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter((s: any) => s.name.toLowerCase().includes(q) || s.device_name.toLowerCase().includes(q))
  }
  return list
})

const summary = computed(() => {
  const list = sensors.value || []
  let ok = 0, warning = 0, down = 0
  for (const s of list) {
    const st = sensorState(s)
    if (st === 'ok') ok++
    else if (st === 'warning') warning++
    else down++
  }
  return { total: list.length, ok, warning, down }
})

const typeIcon: Record<string, string> = {
  temperature: 'i-lucide-thermometer',
  fan: 'i-lucide-fan',
  voltage: 'i-lucide-zap',
  power: 'i-lucide-plug',
  humidity: 'i-lucide-droplets',
  ping: 'i-lucide-radio'
}
</script>

<template>
  <div>
    <PageHeader title="Sensors" subtitle="Every monitored measurement across the fleet" icon="i-lucide-gauge" />

    <div v-if="!hasApp('net')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Net.</p>
    </div>

    <div v-else class="space-y-6">
      <div class="grid gap-4 sm:grid-cols-4">
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Total Sensors</span>
          <span class="mt-2 text-3xl font-bold text-foam">{{ summary.total }}</span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">OK</span>
          <span class="mt-2 text-3xl font-bold text-green-500">{{ summary.ok }}</span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Warning</span>
          <span class="mt-2 text-3xl font-bold text-orange-500">{{ summary.warning }}</span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Down</span>
          <span class="mt-2 text-3xl font-bold text-red-500">{{ summary.down }}</span>
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
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-if="status === 'pending' && !sensors" class="animate-pulse">
                <td colspan="6" class="px-4 py-8 text-center text-faint">Loading sensors...</td>
              </tr>
              <tr v-else-if="filtered.length === 0">
                <td colspan="6" class="px-4 py-8 text-center text-faint">No sensors found.</td>
              </tr>
              <tr v-for="s in filtered" :key="s.id" class="hover:bg-surface-2/50 transition">
                <td class="px-4 py-3">
                  <UBadge size="xs" variant="soft" :color="sensorState(s) === 'ok' ? 'success' : sensorState(s) === 'warning' ? 'warning' : 'error'">
                    {{ sensorState(s) === 'ok' ? 'OK' : sensorState(s) === 'warning' ? 'Warning' : 'Down' }}
                  </UBadge>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <UIcon :name="typeIcon[s.sensor_type] || 'i-lucide-activity'" class="size-4 text-faint shrink-0" />
                    <span class="font-medium text-foam">{{ s.name }}</span>
                  </div>
                  <div class="text-xs text-faint uppercase mt-0.5">{{ s.sensor_type }}</div>
                </td>
                <td class="px-4 py-3">
                  <NuxtLink :to="`/net/devices/${s.device_id}`" class="text-foam hover:text-beacon transition">{{ s.device_name }}</NuxtLink>
                  <div class="font-mono text-xs text-faint">{{ s.device_ip }}</div>
                </td>
                <td class="px-4 py-3">
                  <span class="font-display text-base font-semibold" :class="sensorState(s) === 'ok' ? 'text-green-500' : sensorState(s) === 'warning' ? 'text-orange-500' : 'text-red-500'">
                    {{ s.current_value }}
                  </span>
                  <span class="text-xs text-faint ml-1">{{ s.unit }}</span>
                </td>
                <td class="px-4 py-3 text-xs font-mono">{{ s.limit_low }} – {{ s.limit_high }} {{ s.unit }}</td>
                <td class="px-4 py-3">
                  <div class="w-full bg-surface-2 h-1.5 rounded overflow-hidden">
                    <div
                      class="h-full transition-all"
                      :class="sensorState(s) === 'ok' ? 'bg-green-500' : sensorState(s) === 'warning' ? 'bg-orange-500' : 'bg-red-500'"
                      :style="{ width: Math.max(0, Math.min(((s.current_value / (s.limit_high || 1)) * 100) || 0, 100)) + '%' }"
                    ></div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
