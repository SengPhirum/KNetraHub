<script setup lang="ts">
// Per-module audit trail viewer used by the dedicated app administration pages
// and the portal admin pages. Two views backed by
// separate stores: user activity (who clicked what - activity_log) and
// system events (what the system did on its own - system_log).
const props = withDefaults(defineProps<{
  module: 'docker' | 'monitoring' | 'ipmgt' | 'portal'
  initialView?: 'activity' | 'system'
  showSwitcher?: boolean
}>(), {
  initialView: 'activity',
  showSwitcher: true
})

interface ActivityEntry {
  id: string; ts: string; actor: string; role?: string; method: string
  path: string; action: string; target?: string; status?: number; ip?: string; detail?: string
}
interface SystemEntry { id: string; ts: string; level: 'info' | 'warning' | 'error'; event: string; detail?: string }

const { relative } = useFormat()
const { can, hasApp } = useAuth()
const canViewAudit = computed(() => props.module === 'portal' ? can('manager') : hasApp(props.module, 'manager'))
const view = ref<'activity' | 'system'>(props.initialView === 'activity' && !canViewAudit.value ? 'system' : props.initialView)
const search = ref('')

watch(canViewAudit, (allowed) => {
  if (!allowed && view.value === 'activity') view.value = 'system'
})

const { data: activity, status: activityStatus, error: activityError, refresh: refreshActivity } =
  useFetch<ActivityEntry[]>('/api/system/logs/activity', { query: { module: props.module, limit: 300 }, lazy: true })
const { data: system, status: systemStatus, error: systemError, refresh: refreshSystem } =
  useFetch<SystemEntry[]>('/api/system/logs/system', { query: { module: props.module, limit: 300 }, lazy: true })

const loading = computed(() => (view.value === 'activity' ? activityStatus.value : systemStatus.value) === 'pending')
const loadError = computed(() => view.value === 'activity' ? activityError.value : systemError.value)

function matches(text: string) {
  return text.toLowerCase().includes(search.value.trim().toLowerCase())
}
const filteredActivity = computed(() => {
  const rows = activity.value || []
  if (!search.value.trim()) return rows
  return rows.filter((r) => matches(`${r.actor} ${r.action} ${r.path} ${r.target || ''} ${r.ip || ''}`))
})
const filteredSystem = computed(() => {
  const rows = system.value || []
  if (!search.value.trim()) return rows
  return rows.filter((r) => matches(`${r.level} ${r.event} ${r.detail || ''}`))
})

function refresh() {
  return view.value === 'activity' ? refreshActivity() : refreshSystem()
}

function statusColor(status?: number) {
  if (status == null) return 'neutral'
  if (status >= 500) return 'error'
  if (status >= 400) return 'warning'
  return 'success'
}
function levelColor(level: string) {
  if (level === 'error') return 'error'
  if (level === 'warning') return 'warning'
  return 'info'
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div v-if="showSwitcher" class="inline-flex rounded-lg bg-surface-2 p-1 text-sm">
        <button
          type="button" class="rounded-md px-3 py-1.5 font-medium transition"
          :disabled="!canViewAudit"
          :title="canViewAudit ? undefined : 'Manager access is required to view audit logs'"
          :class="view === 'activity' ? 'bg-beacon/15 text-beacon' : canViewAudit ? 'text-faint hover:text-foam' : 'cursor-not-allowed text-faint opacity-45'"
          @click="view = 'activity'"
        >
          <UIcon v-if="!canViewAudit" name="i-lucide-lock" class="mr-1 inline-block size-3" />
          Audit logs
        </button>
        <button
          type="button" class="rounded-md px-3 py-1.5 font-medium transition"
          :class="view === 'system' ? 'bg-beacon/15 text-beacon' : 'text-faint hover:text-foam'"
          @click="view = 'system'"
        >System logs</button>
      </div>
      <div class="flex items-center gap-2">
        <UInput v-model="search" icon="i-lucide-search" size="sm" placeholder="Filter entries" class="w-56" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" size="sm" :loading="loading" aria-label="Refresh" @click="refresh()" />
      </div>
    </div>

    <div v-if="loadError" class="notice-warning panel-flush flex items-start gap-2 p-3 text-xs">
      <UIcon name="i-lucide-lock" class="size-3.5 mt-0.5 shrink-0" />
      {{ loadError.statusCode === 403 ? 'Viewing this log requires manager access to this module.' : (loadError.data?.statusMessage || loadError.message) }}
    </div>

    <template v-else-if="view === 'activity'">
      <p v-if="!filteredActivity.length" class="panel-flush rounded-lg p-6 text-center text-xs text-faint">
        No user activity recorded{{ search ? ' matching the filter' : '' }} yet.
      </p>
      <div v-else class="panel-flush overflow-x-auto rounded-lg">
        <table class="w-full min-w-[46rem] text-left text-xs">
          <thead>
            <tr class="border-b border-hull text-[11px] font-semibold uppercase tracking-wide text-faint">
              <th class="px-3 py-2.5">Time</th>
              <th class="px-3 py-2.5">User</th>
              <th class="px-3 py-2.5">Action</th>
              <th class="px-3 py-2.5">Target</th>
              <th class="px-3 py-2.5">Status</th>
              <th class="px-3 py-2.5">IP</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-hull-soft">
            <tr v-for="r in filteredActivity" :key="r.id" :title="`${r.method} ${r.path}`">
              <td class="whitespace-nowrap px-3 py-2 text-faint" :title="r.ts">{{ relative(r.ts) }}</td>
              <td class="px-3 py-2">
                <span class="font-medium text-foam">{{ r.actor }}</span>
                <span v-if="r.role" class="ml-1 text-faint">({{ r.role }})</span>
              </td>
              <td class="px-3 py-2 font-mono">{{ r.action }}</td>
              <td class="max-w-48 truncate px-3 py-2 font-mono text-faint">{{ r.target || '-' }}</td>
              <td class="px-3 py-2"><UBadge :color="statusColor(r.status)" variant="subtle" size="sm" :label="String(r.status ?? '-')" /></td>
              <td class="whitespace-nowrap px-3 py-2 font-mono text-faint">{{ r.ip || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else>
      <p v-if="!filteredSystem.length" class="panel-flush rounded-lg p-6 text-center text-xs text-faint">
        No system events recorded{{ search ? ' matching the filter' : '' }} yet.
      </p>
      <div v-else class="panel-flush overflow-x-auto rounded-lg">
        <table class="w-full min-w-[36rem] text-left text-xs">
          <thead>
            <tr class="border-b border-hull text-[11px] font-semibold uppercase tracking-wide text-faint">
              <th class="px-3 py-2.5">Time</th>
              <th class="px-3 py-2.5">Level</th>
              <th class="px-3 py-2.5">Event</th>
              <th class="px-3 py-2.5">Detail</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-hull-soft">
            <tr v-for="r in filteredSystem" :key="r.id">
              <td class="whitespace-nowrap px-3 py-2 text-faint" :title="r.ts">{{ relative(r.ts) }}</td>
              <td class="px-3 py-2"><UBadge :color="levelColor(r.level)" variant="subtle" size="sm" :label="r.level" /></td>
              <td class="px-3 py-2 font-mono">{{ r.event }}</td>
              <td class="px-3 py-2 text-faint">{{ r.detail || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
