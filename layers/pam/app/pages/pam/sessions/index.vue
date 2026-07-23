<script setup lang="ts">
// Sessions — live and historical. Monitors see everyone's; users see their own.
const { shortTime } = usePam()
const activeOnly = ref(true)
const { data, status, error, refresh } = useAsyncData('pamSessions',
  () => $fetch<any[]>('/api/pam/v1/sessions', { params: activeOnly.value ? { active: 'true' } : {} }),
  { server: false, default: () => [], watch: [activeOnly] })

// Poll live sessions every 5s.
let poll: any = null
onMounted(() => { poll = setInterval(() => refresh(), 5000) })
onUnmounted(() => { if (poll) clearInterval(poll) })

const stateBadge: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30',
  starting: 'bg-sky-500/10 text-sky-400 ring-1 ring-inset ring-sky-500/30',
  idle: 'bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30',
  ended: 'text-faint ring-1 ring-inset ring-hull',
  terminated: 'bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/30',
  error: 'bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/30'
}
</script>

<template>
  <div>
    <PageHeader title="Sessions" subtitle="Brokered privileged sessions — live and historical" icon="i-lucide-monitor-play">
      <template #actions><UButton to="/pam/sessions/recordings" icon="i-lucide-clapperboard" size="sm" color="neutral" variant="soft">Recordings</UButton></template>
    </PageHeader>
    <div class="mb-3"><UCheckbox v-model="activeOnly" label="Active only" /></div>
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No sessions.">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">User</th><th class="px-3 py-2">Target</th><th class="px-3 py-2">Protocol</th><th class="px-3 py-2">State</th><th class="px-3 py-2">Recording</th><th class="px-3 py-2">Started</th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="s in data" :key="s.id" class="cursor-pointer hover:bg-surface-2/40" @click="navigateTo(`/pam/sessions/${s.id}`)">
              <td class="px-3 py-2 text-foam">{{ s.principal }}<UIcon v-if="s.emergency" name="i-lucide-siren" class="ml-1 size-3.5 text-rose-400" /></td>
              <td class="px-3 py-2 text-(--color-muted)">{{ s.account_name || s.target }}</td>
              <td class="px-3 py-2 uppercase text-(--color-muted)">{{ s.protocol }}</td>
              <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="stateBadge[s.state]">{{ s.state }}</span></td>
              <td class="px-3 py-2 text-xs text-faint">{{ s.recording_status }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ shortTime(s.started_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>
  </div>
</template>
