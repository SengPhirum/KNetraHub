<script setup lang="ts">
// Monitoring overview: fleet status, active alerts, entity counts, poller and
// receiver health — all from real collected data (/api/monitoring/v1/system/status).
const { hasMonitoring, deviceStatusMeta } = useMonitoring()

const { data, status, refresh } = useAsyncData('monStatus',
  () => $fetch<any>('/api/monitoring/v1/system/status'),
  { server: false, default: () => null })

const { data: alerts } = useAsyncData('monOverviewAlerts',
  () => $fetch<any>('/api/monitoring/v1/alerts?per_page=8'),
  { server: false, default: () => ({ items: [] }) })

let timer: any = null
onMounted(() => { timer = setInterval(refresh, 15000) })
onBeforeUnmount(() => timer && clearInterval(timer))

const deviceCards = computed(() => {
  const d = data.value?.devices
  if (!d) return []
  return [
    { key: 'up', label: 'Up', value: d.up, cls: 'text-emerald-400' },
    { key: 'down', label: 'Down', value: d.down, cls: 'text-rose-400' },
    { key: 'degraded', label: 'Degraded', value: d.degraded, cls: 'text-amber-400' },
    { key: 'maintenance', label: 'Maintenance', value: d.maintenance, cls: 'text-sky-400' },
    { key: 'pending', label: 'Pending', value: d.pending, cls: 'text-violet-400' },
    { key: 'disabled', label: 'Disabled', value: d.disabled, cls: 'text-zinc-400' }
  ]
})
</script>

<template>
  <div>
    <PageHeader title="Monitoring" subtitle="Fleet health, alerts, and collection coverage" icon="i-lucide-radar" />

    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">You do not have access to the Monitoring app.</div>

    <div v-else class="space-y-6">
      <!-- Device status summary -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <NuxtLink v-for="c in deviceCards" :key="c.key" :to="`/monitoring/devices?status=${c.key}`"
          class="panel p-4 transition hover:ring-1 hover:ring-primary/40">
          <div class="text-xs uppercase tracking-wide text-faint">{{ c.label }}</div>
          <div class="mt-1 text-2xl font-semibold" :class="c.cls">{{ c.value ?? '—' }}</div>
        </NuxtLink>
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <!-- Active alerts -->
        <div class="panel p-4 lg:col-span-2">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="font-semibold">Active alerts</h2>
            <NuxtLink to="/monitoring/alerts" class="text-sm text-primary hover:underline">View all →</NuxtLink>
          </div>
          <div v-if="!alerts?.items?.length" class="py-8 text-center text-sm text-muted">No active alerts.</div>
          <table v-else class="w-full text-sm">
            <tbody>
              <tr v-for="a in alerts.items" :key="a.id" class="border-t border-hull">
                <td class="py-2">
                  <span :class="['inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
                    a.severity === 'critical' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400']">
                    {{ a.severity }}
                  </span>
                </td>
                <td class="py-2">
                  <NuxtLink :to="`/monitoring/devices/${a.device_id}`" class="font-medium hover:underline">
                    {{ a.hostname || a.display_name || '—' }}
                  </NuxtLink>
                </td>
                <td class="py-2 text-muted">{{ a.rule_name }}</td>
                <td class="py-2 text-right text-xs text-faint">{{ a.state }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Collection + pollers -->
        <div class="space-y-6">
          <div class="panel p-4">
            <h2 class="mb-3 font-semibold">Entities monitored</h2>
            <dl class="space-y-2 text-sm">
              <div class="flex justify-between"><dt class="text-muted">Devices</dt><dd class="font-medium">{{ data?.devices?.total ?? '—' }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Ports</dt><dd class="font-medium">{{ data?.entities?.ports ?? '—' }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Sensors</dt><dd class="font-medium">{{ data?.entities?.sensors ?? '—' }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted">Services</dt><dd class="font-medium">{{ data?.entities?.services ?? '—' }}</dd></div>
            </dl>
          </div>
          <div class="panel p-4">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="font-semibold">Pollers</h2>
              <NuxtLink to="/monitoring/pollers" class="text-sm text-primary hover:underline">Details →</NuxtLink>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-2xl font-semibold" :class="data?.pollers?.healthy ? 'text-emerald-400' : 'text-rose-400'">
                {{ data?.pollers?.healthy ?? 0 }}
              </span>
              <span class="text-sm text-muted">/ {{ data?.pollers?.total ?? 0 }} healthy</span>
            </div>
          </div>
          <NuxtLink to="/monitoring/data-collection" class="panel block p-4 transition hover:ring-1 hover:ring-primary/40">
            <h2 class="font-semibold">Data collection</h2>
            <p class="mt-1 text-sm text-muted">Per-device coverage, failures, and stale data — the no-silent-loss audit surface.</p>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
