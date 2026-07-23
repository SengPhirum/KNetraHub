<script setup lang="ts">
// Per-module audit trail viewer used by the dedicated app administration pages
// and the portal admin pages. Two views backed by
// separate stores: user activity (who clicked what - activity_log) and
// system events (what the system did on its own - system_log).
// Tab styling follows the module settings pages (UTabs variant="link").
const props = withDefaults(defineProps<{
  module: 'docker' | 'monitoring' | 'ipmgt' | 'pam' | 'work' | 'portal'
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
interface SystemEntry { id: string; ts: string; level: 'debug' | 'info' | 'warning' | 'error'; event: string; detail?: string }

const { relative } = useFormat()
const { can, hasApp } = useAuth()
const canViewAudit = computed(() => props.module === 'portal' ? can('manager') : hasApp(props.module, 'manager'))
const view = ref<'activity' | 'system'>(props.initialView === 'activity' && !canViewAudit.value ? 'system' : props.initialView)
const search = ref('')
const level = ref<'all' | SystemEntry['level']>('all')
const debugEnabled = ref(false)
const savingDebug = ref(false)
const toast = useToast()

watch(canViewAudit, (allowed) => {
  if (!allowed && view.value === 'activity') view.value = 'system'
})

const tabItems = computed(() => [
  {
    label: 'Audit logs',
    icon: canViewAudit.value ? 'i-lucide-scroll-text' : 'i-lucide-lock',
    slot: 'activity' as const,
    value: 'activity',
    disabled: !canViewAudit.value
  },
  { label: 'System logs', icon: 'i-lucide-file-clock', slot: 'system' as const, value: 'system' }
])

const { data: activity, status: activityStatus, error: activityError, refresh: refreshActivity } =
  useFetch<ActivityEntry[]>('/api/system/logs/activity', { query: { module: props.module, limit: 300 }, lazy: true })
const systemQuery = computed(() => ({ module: props.module, limit: 300, includeDebug: canViewAudit.value && debugEnabled.value ? 'true' : 'false' }))
const { data: system, status: systemStatus, error: systemError, refresh: refreshSystem } =
  useFetch<SystemEntry[]>('/api/system/logs/system', { query: systemQuery, lazy: true })

const levelItems = computed(() => [
  { label: 'All levels', value: 'all' },
  ...(canViewAudit.value ? [{ label: 'Debug', value: 'debug' }] : []),
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warning' },
  { label: 'Error', value: 'error' }
])

async function loadDebugConfig() {
  if (!canViewAudit.value) return
  try {
    const config = await $fetch<{ module: string; enabled: boolean }>('/api/system/logs/debug', { query: { module: props.module } })
    debugEnabled.value = config.enabled
  } catch {
    debugEnabled.value = false
  }
}

watch(canViewAudit, (allowed) => {
  if (allowed) loadDebugConfig()
  else debugEnabled.value = false
}, { immediate: true })

async function setDebugEnabled(enabled: boolean) {
  if (!canViewAudit.value) return
  savingDebug.value = true
  try {
    const config = await $fetch<{ enabled: boolean }>('/api/system/logs/debug', {
      method: 'PUT',
      body: { module: props.module, enabled }
    })
    debugEnabled.value = config.enabled
    if (!config.enabled && level.value === 'debug') level.value = 'all'
    await refreshSystem()
    toast.add({ title: `Debug logging ${config.enabled ? 'enabled' : 'disabled'}`, color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Debug setting failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    savingDebug.value = false
  }
}

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
  return rows.filter((r) => {
    if (level.value !== 'all' && r.level !== level.value) return false
    return !search.value.trim() || matches(`${r.level} ${r.event} ${r.detail || ''}`)
  })
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
  if (level === 'debug') return 'neutral'
  return 'info'
}
</script>

<template>
  <UTabs
    v-model="view"
    :items="tabItems"
    variant="link"
    :unmount-on-hide="false"
    :ui="showSwitcher ? undefined : { list: 'hidden' }"
  >
    <template #activity>
      <div class="space-y-3 pt-4">
        <div class="flex flex-wrap items-center justify-end gap-2">
          <UInput v-model="search" icon="i-lucide-search" size="sm" placeholder="Filter entries" class="w-56" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" size="sm" :loading="loading" aria-label="Refresh" @click="refresh()" />
        </div>

        <div v-if="loadError" class="notice-warning panel-flush flex items-start gap-2 p-3 text-xs">
          <UIcon name="i-lucide-lock" class="size-3.5 mt-0.5 shrink-0" />
          {{ loadError.statusCode === 403 ? 'Viewing this log requires manager access to this module.' : (loadError.data?.statusMessage || loadError.message) }}
        </div>
        <p v-else-if="!filteredActivity.length" class="panel-flush rounded-lg p-6 text-center text-xs text-faint">
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
      </div>
    </template>

    <template #system>
      <div class="space-y-3 pt-4">
        <div class="flex flex-wrap items-center justify-end gap-2">
          <div v-if="canViewAudit" class="mr-auto flex items-center gap-2 text-xs text-(--color-muted)">
            <USwitch :model-value="debugEnabled" :loading="savingDebug" size="sm" @update:model-value="setDebugEnabled" />
            <span>Debug logging</span>
          </div>
          <USelect v-model="level" :items="levelItems" value-key="value" label-key="label" size="sm" class="w-36" />
          <UInput v-model="search" icon="i-lucide-search" size="sm" placeholder="Filter entries" class="w-56" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" size="sm" :loading="loading" aria-label="Refresh" @click="refresh()" />
        </div>

        <div v-if="loadError" class="notice-warning panel-flush flex items-start gap-2 p-3 text-xs">
          <UIcon name="i-lucide-lock" class="size-3.5 mt-0.5 shrink-0" />
          {{ loadError.statusCode === 403 ? 'Viewing this log requires manager access to this module.' : (loadError.data?.statusMessage || loadError.message) }}
        </div>
        <p v-else-if="!filteredSystem.length" class="panel-flush rounded-lg p-6 text-center text-xs text-faint">
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
      </div>
    </template>
  </UTabs>
</template>
