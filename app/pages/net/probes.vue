<script setup lang="ts">
const { hasApp } = useAuth()

const { data: probes, status, refresh } = useAsyncData('netProbes', () => $fetch('/api/net/probes'), {
  server: false
})

onMounted(() => {
  const interval = setInterval(refresh, 15000)
  onUnmounted(() => clearInterval(interval))
})

const typeMeta: Record<string, { label: string; icon: string }> = {
  local: { label: 'Local Probe', icon: 'i-lucide-server' },
  remote: { label: 'Remote Probe', icon: 'i-lucide-radio-tower' },
  'multi-platform': { label: 'Multi-Platform Probe', icon: 'i-lucide-cpu' }
}

const summary = computed(() => {
  const list = probes.value || []
  return {
    total: list.length,
    connected: list.filter((p: any) => p.status === 'connected').length,
    devices: list.reduce((a: number, p: any) => a + (p.device_count || 0), 0),
    sensors: list.reduce((a: number, p: any) => a + (p.sensor_count || 0), 0)
  }
})
</script>

<template>
  <div>
    <PageHeader title="Probes" subtitle="Distributed data collectors reporting to the core" icon="i-lucide-radio-tower">
      <template #actions>
        <NuxtLink to="/net/maps" class="text-sm font-medium text-(--color-muted) hover:text-foam flex items-center gap-1">
          <UIcon name="i-lucide-map" class="size-4" /> View on map
        </NuxtLink>
      </template>
    </PageHeader>

    <div v-if="!hasApp('net')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Net.</p>
    </div>

    <div v-else class="space-y-6">
      <div class="grid gap-4 sm:grid-cols-4">
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Probes</span>
          <span class="mt-2 text-3xl font-bold text-foam">{{ summary.total }}</span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Connected</span>
          <span class="mt-2 text-3xl font-bold text-green-500">{{ summary.connected }}</span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Devices</span>
          <span class="mt-2 text-3xl font-bold text-foam">{{ summary.devices }}</span>
        </div>
        <div class="panel p-5 flex flex-col">
          <span class="text-xs font-semibold uppercase text-(--color-muted)">Sensors</span>
          <span class="mt-2 text-3xl font-bold text-foam">{{ summary.sensors }}</span>
        </div>
      </div>

      <div v-if="status === 'pending' && !probes" class="panel p-10 text-center text-faint">Loading probes...</div>

      <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="p in probes" :key="p.id" class="panel p-5 flex flex-col gap-4">
          <div class="flex items-start gap-3">
            <span class="flex size-11 items-center justify-center rounded-xl bg-beacon/12 ring-1 ring-beacon/25 shrink-0">
              <UIcon :name="typeMeta[p.type]?.icon || 'i-lucide-radio-tower'" class="size-6 text-beacon" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="font-display font-semibold text-foam truncate">{{ p.name }}</p>
              <p class="text-[11px] uppercase tracking-wider text-faint">{{ typeMeta[p.type]?.label || p.type }}</p>
            </div>
            <UBadge size="xs" variant="soft" :color="p.status === 'connected' ? 'success' : 'error'">
              <span class="size-1.5 rounded-full mr-1" :class="p.status === 'connected' ? 'bg-green-500' : 'bg-red-500'"></span>
              {{ p.status }}
            </UBadge>
          </div>

          <dl class="grid grid-cols-2 gap-y-2 text-sm">
            <dt class="text-faint">Location</dt>
            <dd class="text-foam text-right truncate">{{ p.location || '—' }}</dd>
            <dt class="text-faint">Address</dt>
            <dd class="text-foam text-right font-mono text-xs">{{ p.ip || '—' }}</dd>
            <dt class="text-faint">Version</dt>
            <dd class="text-foam text-right">{{ p.version || '—' }}</dd>
          </dl>

          <div class="mt-auto grid grid-cols-3 gap-2 border-t border-surface pt-4 text-center">
            <div>
              <div class="text-lg font-display font-semibold text-foam">{{ p.device_count }}</div>
              <div class="text-[10px] uppercase tracking-wider text-faint">Devices</div>
            </div>
            <div>
              <div class="text-lg font-display font-semibold" :class="p.devices_down ? 'text-red-500' : 'text-green-500'">
                {{ p.devices_up }}/{{ p.device_count }}
              </div>
              <div class="text-[10px] uppercase tracking-wider text-faint">Up</div>
            </div>
            <div>
              <div class="text-lg font-display font-semibold text-foam">{{ p.sensor_count }}</div>
              <div class="text-[10px] uppercase tracking-wider text-faint">Sensors</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
