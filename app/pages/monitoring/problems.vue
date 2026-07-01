<script setup lang="ts">
// Unified Problems: one severity-sorted list merging the Network module's alerts
// and the Server module's problems, so the Monitoring app shows problems as one
// thing (not separate Network/Server pages). Acknowledge works for both;
// server problems can also be closed.
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const { data: netAlerts, refresh: refreshNet } = useAsyncData('unifiedNetAlerts', () => $fetch<any[]>('/api/net/alerts'), { default: () => [], server: false })
const { data: srvProblems, refresh: refreshSrv } = useAsyncData('unifiedSrvProblems', () => $fetch<any[]>('/api/server/problems'), { default: () => [], server: false })
onMounted(() => { const t = setInterval(() => { refreshNet(); refreshSrv() }, 15000); onUnmounted(() => clearInterval(t)) })

// Map the Network module's string severities onto the shared 0-5 scale.
function netSeverity(s: string): number {
  const v = String(s || '').toLowerCase()
  if (v === 'critical') return 4
  if (v === 'warning') return 2
  if (v === 'info' || v === 'information') return 1
  return 0
}

// Normalize both sources into one row shape.
const items = computed(() => {
  const out: any[] = []
  for (const a of netAlerts.value || []) {
    out.push({
      key: `net:${a.id}`, id: a.id, source: 'network',
      severityNum: netSeverity(a.severity),
      name: a.message, entity: a.device_name || 'Unknown device',
      time: a.timestamp, active: a.status === 'active',
      ack: !!a.acknowledged_at, suppressed: false, canClose: false
    })
  }
  for (const p of srvProblems.value || []) {
    out.push({
      key: `srv:${p.id}`, id: p.id, source: 'server',
      severityNum: Number(p.severity_num),
      name: p.name, entity: p.host || 'Unknown host',
      time: p.fired_at, active: p.status === 'problem',
      ack: !!p.ack, suppressed: !!p.suppressed, canClose: true
    })
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || b.severityNum - a.severityNum || Date.parse(b.time) - Date.parse(a.time))
})

const minSeverity = ref(0)
const sourceFilter = ref<'all' | 'network' | 'server'>('all')
const showResolved = ref(false)
const rows = computed(() => items.value.filter((i) =>
  (showResolved.value || i.active) &&
  i.severityNum >= minSeverity.value &&
  (sourceFilter.value === 'all' || i.source === sourceFilter.value)
))

const summary = computed(() => ({
  active: items.value.filter((i) => i.active).length,
  network: items.value.filter((i) => i.active && i.source === 'network').length,
  server: items.value.filter((i) => i.active && i.source === 'server').length
}))

const acting = ref<string | null>(null)
async function toggleAck(i: any) {
  acting.value = i.key
  try {
    const url = i.source === 'network' ? `/api/net/alerts/${i.id}/ack` : `/api/server/problems/${i.id}/ack`
    await $fetch(url, { method: 'POST', body: { acknowledged: !i.ack } })
    await (i.source === 'network' ? refreshNet() : refreshSrv())
  } catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { acting.value = null }
}
async function close(i: any) {
  acting.value = i.key
  try { await $fetch(`/api/server/problems/${i.id}/close`, { method: 'POST' }); toast.add({ title: 'Problem closed', color: 'primary', icon: 'i-lucide-check' }); await refreshSrv() }
  catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { acting.value = null }
}

function duration(t: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 1000))
  if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`
}
function entityLink(i: any) {
  return i.source === 'network' ? `/monitoring/network/devices/${(netAlerts.value || []).find((a) => a.id === i.id)?.device_id}` : `/monitoring/server/hosts/${(srvProblems.value || []).find((p) => p.id === i.id)?.host_id}`
}
</script>

<template>
  <div>
    <PageHeader title="Problems" subtitle="Unified network alerts and server problems" icon="i-lucide-triangle-alert" />

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="space-y-4">
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="panel p-5 flex flex-col"><span class="text-xs font-semibold uppercase text-(--color-muted)">Active problems</span><span class="mt-2 text-3xl font-bold text-orange-500">{{ summary.active }}</span></div>
        <div class="panel p-5 flex flex-col"><span class="text-xs font-semibold uppercase text-(--color-muted)">Network</span><span class="mt-2 text-3xl font-bold text-foam">{{ summary.network }}</span></div>
        <div class="panel p-5 flex flex-col"><span class="text-xs font-semibold uppercase text-(--color-muted)">Server</span><span class="mt-2 text-3xl font-bold text-foam">{{ summary.server }}</span></div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="flex flex-wrap gap-1.5">
          <button v-for="s in SEVERITIES" :key="s.value"
                  class="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
                  :class="minSeverity === s.value ? 'bg-beacon/15 text-beacon ring-1 ring-inset ring-beacon/30' : 'text-(--color-muted) hover:bg-surface-2'"
                  @click="minSeverity = s.value">≥ {{ s.label }}</button>
        </div>
        <div class="flex gap-1.5">
          <button v-for="src in (['all', 'network', 'server'] as const)" :key="src"
                  class="rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors"
                  :class="sourceFilter === src ? 'bg-beacon/15 text-beacon ring-1 ring-inset ring-beacon/30' : 'text-(--color-muted) hover:bg-surface-2'"
                  @click="sourceFilter = src">{{ src }}</button>
        </div>
        <UCheckbox v-model="showResolved" label="Show resolved" class="ml-auto" />
      </div>

      <div class="panel">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm text-(--color-muted)">
            <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
              <tr>
                <th class="px-4 py-3 font-medium">Time</th>
                <th class="px-4 py-3 font-medium">Severity</th>
                <th class="px-4 py-3 font-medium">Source</th>
                <th class="px-4 py-3 font-medium">Entity</th>
                <th class="px-4 py-3 font-medium">Problem</th>
                <th class="px-4 py-3 font-medium">Duration</th>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-if="!rows.length"><td colspan="8" class="px-4 py-8 text-center text-faint">No problems. All clear.</td></tr>
              <tr v-for="i in rows" :key="i.key" class="hover:bg-surface-2/50 transition">
                <td class="px-4 py-3 whitespace-nowrap text-xs">{{ new Date(i.time).toLocaleString() }}</td>
                <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-xs font-medium" :class="severityMeta(i.severityNum).badge">{{ severityMeta(i.severityNum).label }}</span></td>
                <td class="px-4 py-3"><UBadge :color="i.source === 'network' ? 'info' : 'primary'" variant="subtle" size="xs" class="capitalize">{{ i.source }}</UBadge></td>
                <td class="px-4 py-3"><NuxtLink :to="entityLink(i)" class="font-medium text-foam hover:text-beacon transition">{{ i.entity }}</NuxtLink></td>
                <td class="px-4 py-3">{{ i.name }}<UBadge v-if="i.suppressed" color="neutral" variant="subtle" size="xs" class="ml-1">suppressed</UBadge></td>
                <td class="px-4 py-3 text-xs">{{ duration(i.time) }}</td>
                <td class="px-4 py-3"><span :class="i.active ? 'text-red-500' : 'text-green-500'">{{ i.active ? 'Problem' : 'Resolved' }}</span></td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end items-center gap-1">
                    <UIcon v-if="i.ack" name="i-lucide-check-square" class="size-4 text-green-500" />
                    <template v-if="canManage && i.active">
                      <UButton size="xs" variant="ghost" color="neutral" :loading="acting === i.key" @click="toggleAck(i)">{{ i.ack ? 'Un-ack' : 'Ack' }}</UButton>
                      <UButton v-if="i.canClose" size="xs" variant="ghost" color="error" icon="i-lucide-check" aria-label="Close" :loading="acting === i.key" @click="close(i)" />
                    </template>
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
