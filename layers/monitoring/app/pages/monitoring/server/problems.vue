<script setup lang="ts">
// Zabbix Problems: open + recent-resolved events with Zabbix severities,
// acknowledge, manual close, and maintenance-suppression badge.
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const { data: problems, status, refresh } = useAsyncData('serverProblemsList', () => $fetch<any[]>('/api/server/problems'), { default: () => [], server: false })
onMounted(() => { const t = setInterval(() => { if (!document.hidden) refresh() }, 15000); onUnmounted(() => clearInterval(t)) })

const showResolved = ref(false)
const minSeverity = ref(0)
const rows = computed(() => (problems.value || []).filter((p: any) =>
  (showResolved.value || p.status === 'problem') && Number(p.severity_num) >= minSeverity.value
))

const acting = ref<string | null>(null)
async function toggleAck(p: any) {
  acting.value = p.id
  try { await $fetch(`/api/server/problems/${p.id}/ack`, { method: 'POST', body: { acknowledged: !p.ack } }); await refresh() }
  catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { acting.value = null }
}
async function close(p: any) {
  acting.value = p.id
  try { await $fetch(`/api/server/problems/${p.id}/close`, { method: 'POST' }); toast.add({ title: 'Problem closed', color: 'primary', icon: 'i-lucide-check' }); await refresh() }
  catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { acting.value = null }
}

function duration(p: any) {
  const end = p.r_clock ? Date.parse(p.r_clock) : Date.now()
  const s = Math.max(0, Math.round((end - Date.parse(p.fired_at)) / 1000))
  if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`
}
</script>

<template>
  <div>
    <PageHeader title="Problems" subtitle="Active and recent events across all hosts" icon="i-lucide-triangle-alert" />

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex flex-wrap gap-1.5">
          <button v-for="s in SEVERITIES" :key="s.value"
                  class="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
                  :class="minSeverity === s.value ? 'bg-beacon/15 text-beacon ring-1 ring-inset ring-beacon/30' : 'text-(--color-muted) hover:bg-surface-2'"
                  @click="minSeverity = s.value">≥ {{ s.label }}</button>
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
                <th class="px-4 py-3 font-medium">Host</th>
                <th class="px-4 py-3 font-medium">Problem</th>
                <th class="px-4 py-3 font-medium">Duration</th>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium text-right">Ack</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-if="status === 'pending' && !problems.length"><td colspan="7" class="px-4 py-8 text-center text-faint">Loading…</td></tr>
              <tr v-else-if="!rows.length"><td colspan="7" class="px-4 py-8 text-center text-faint">No problems. All clear.</td></tr>
              <tr v-for="p in rows" :key="p.id" class="hover:bg-surface-2/50 transition">
                <td class="px-4 py-3 whitespace-nowrap text-xs">{{ new Date(p.fired_at).toLocaleString() }}</td>
                <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-xs font-medium" :class="severityMeta(p.severity_num).badge">{{ severityMeta(p.severity_num).label }}</span></td>
                <td class="px-4 py-3 font-medium text-foam">{{ p.host }}</td>
                <td class="px-4 py-3">
                  {{ p.name }}
                  <UBadge v-if="p.suppressed" color="neutral" variant="subtle" size="xs" class="ml-1">suppressed</UBadge>
                </td>
                <td class="px-4 py-3 text-xs">{{ duration(p) }}</td>
                <td class="px-4 py-3">
                  <span :class="p.status === 'problem' ? 'text-red-500' : 'text-green-500'">{{ p.status === 'problem' ? 'Problem' : 'Resolved' }}</span>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex justify-end items-center gap-1">
                    <UIcon v-if="p.ack" name="i-lucide-check-square" class="size-4 text-green-500" :title="p.ack_by || ''" />
                    <template v-if="canManage && p.status === 'problem'">
                      <UButton size="xs" variant="ghost" color="neutral" :loading="acting === p.id" @click="toggleAck(p)">{{ p.ack ? 'Un-ack' : 'Ack' }}</UButton>
                      <UButton size="xs" variant="ghost" color="error" icon="i-lucide-check" aria-label="Close" :loading="acting === p.id" @click="close(p)" />
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
