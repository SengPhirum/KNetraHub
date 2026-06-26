<script setup lang="ts">
// Distributed monitoring map: plots each probe/site on a simple equirectangular
// world projection with a live up/down status marker, plus a device status grid
// (the "wallboard" half of PRTG's Maps & Dashboards).
const { hasApp } = useAuth()

const { data: probes, refresh: refreshProbes } = useAsyncData('netMapProbes', () => $fetch('/api/net/probes'), { server: false })
const { data: devices, refresh: refreshDevices } = useAsyncData('netMapDevices', () => $fetch('/api/net/devices'), { server: false })

onMounted(() => {
  const interval = setInterval(() => { refreshProbes(); refreshDevices() }, 15000)
  onUnmounted(() => clearInterval(interval))
})

// Equirectangular projection -> percentage offsets inside the map panel.
function project(lat: number, lng: number) {
  return {
    left: ((Number(lng) + 180) / 360) * 100,
    top: ((90 - Number(lat)) / 180) * 100
  }
}

const sites = computed(() =>
  (probes.value || [])
    .filter((p: any) => p.latitude != null && p.longitude != null)
    .map((p: any) => ({ ...p, pos: project(p.latitude, p.longitude) }))
)

const deviceStats = computed(() => {
  const list = devices.value || []
  return {
    total: list.length,
    up: list.filter((d: any) => d.status === 'up').length,
    down: list.filter((d: any) => d.status === 'down').length
  }
})

function deviceIcon(category: string) {
  return category === 'network' ? 'i-lucide-network'
    : category === 'storage' ? 'i-lucide-database'
    : category === 'iot' ? 'i-lucide-cpu'
    : 'i-lucide-server'
}
</script>

<template>
  <div>
    <PageHeader title="Maps" subtitle="Distributed monitoring map and live status wallboard" icon="i-lucide-map" />

    <div v-if="!hasApp('net')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Net.</p>
    </div>

    <div v-else class="space-y-6">
      <!-- World map of probe sites -->
      <div class="panel p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Distributed Sites</h2>
          <div class="flex items-center gap-4 text-xs text-faint">
            <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-green-500"></span> Connected</span>
            <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-red-500"></span> Disconnected</span>
          </div>
        </div>

        <div
          class="relative w-full overflow-hidden rounded-xl border border-surface bg-surface-2"
          style="aspect-ratio: 2 / 1; background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px); background-size: 24px 24px;"
        >
          <!-- latitude/longitude guide lines -->
          <div class="absolute inset-x-0 top-1/2 border-t border-dashed border-white/5"></div>
          <div class="absolute inset-y-0 left-1/2 border-l border-dashed border-white/5"></div>

          <div
            v-for="site in sites" :key="site.id"
            class="absolute -translate-x-1/2 -translate-y-1/2 group"
            :style="{ left: site.pos.left + '%', top: site.pos.top + '%' }"
          >
            <span class="relative flex size-3.5">
              <span
                v-if="site.status === 'connected'"
                class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                :class="site.devices_down ? 'bg-orange-500' : 'bg-green-500'"
              ></span>
              <span
                class="relative inline-flex size-3.5 rounded-full ring-2 ring-ink"
                :class="site.status !== 'connected' ? 'bg-red-500' : site.devices_down ? 'bg-orange-500' : 'bg-green-500'"
              ></span>
            </span>
            <!-- hover card -->
            <div class="pointer-events-none absolute left-1/2 top-5 z-10 hidden w-44 -translate-x-1/2 rounded-lg border border-hull bg-ink/95 p-3 text-left shadow-lg backdrop-blur group-hover:block">
              <p class="text-xs font-semibold text-foam truncate">{{ site.name }}</p>
              <p class="text-[11px] text-faint">{{ site.location }}</p>
              <div class="mt-2 flex items-center justify-between text-[11px]">
                <span class="text-green-500">{{ site.devices_up }} up</span>
                <span class="text-red-500">{{ site.devices_down }} down</span>
                <span class="text-(--color-muted)">{{ site.sensor_count }} sensors</span>
              </div>
            </div>
            <span class="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-(--color-muted) group-hover:opacity-0">
              {{ site.location?.split(',')[0] }}
            </span>
          </div>
        </div>
      </div>

      <!-- Live status wallboard -->
      <div class="panel p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Status Wallboard</h2>
          <div class="flex items-center gap-3 text-xs">
            <span class="text-green-500 font-medium">{{ deviceStats.up }} up</span>
            <span class="text-red-500 font-medium">{{ deviceStats.down }} down</span>
            <span class="text-faint">/ {{ deviceStats.total }}</span>
          </div>
        </div>
        <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          <NuxtLink
            v-for="dev in devices" :key="dev.id" :to="`/net/devices/${dev.id}`"
            class="flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 transition aspect-square"
            :class="dev.status === 'up' ? 'border-green-500/20 bg-green-500/5 hover:border-green-500/50' : 'border-red-500/20 bg-red-500/5 hover:border-red-500/50'"
          >
            <UIcon :name="deviceIcon(dev.category)" class="size-6" :class="dev.status === 'up' ? 'text-green-500' : 'text-red-500'" />
            <span class="text-[10px] font-medium text-foam text-center truncate w-full">{{ dev.hostname }}</span>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
