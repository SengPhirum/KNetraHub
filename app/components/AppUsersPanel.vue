<script setup lang="ts">
import type { AppKey, AppTier } from '~~/shared/utils/entitlements'

// Read-only listing of the users who can access a given sub-app and the role
// (tier) they hold in it. Rendered by each app's Administration > Users page.
// Visible to managers and admins of the app only; the server re-checks.
const props = defineProps<{ app: AppKey; appName: string }>()

const { hasApp } = useAuth()
const canView = computed(() => hasApp(props.app, 'manager'))

const PAGE_SIZE = 20
const page = ref(1)

interface Row { id: string; name: string; username: string; source: string; tier: AppTier }
interface Resp { rows: Row[]; total: number; page: number; pageSize: number }

const data = ref<Resp>({ rows: [], total: 0, page: 1, pageSize: PAGE_SIZE })
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
const error = ref<any>(null)
const refreshing = ref(false)

async function load() {
  if (!canView.value) return
  refreshing.value = status.value === 'success'
  if (status.value !== 'success') status.value = 'pending'
  error.value = null
  try {
    data.value = await $fetch<Resp>('/api/app-users', { query: { app: props.app, page: page.value, pageSize: PAGE_SIZE } })
    status.value = 'success'
  } catch (e: any) {
    error.value = e
    status.value = 'error'
  } finally {
    refreshing.value = false
  }
}

watch(page, load)
// Load on mount, and again if access resolves after mount (auth may hydrate
// slightly after this component renders).
watch(canView, (v, prev) => { if (v && !prev) load() })
onMounted(load)

const totalPages = computed(() => Math.max(1, Math.ceil(data.value.total / PAGE_SIZE)))
const rangeLabel = computed(() => {
  const { total } = data.value
  if (!total) return '0 users'
  const start = (page.value - 1) * PAGE_SIZE + 1
  const end = Math.min(total, page.value * PAGE_SIZE)
  return `${start}–${end} of ${total} user${total === 1 ? '' : 's'}`
})

const TIER_META: Record<AppTier, { icon: string; bg: string; label: string }> = {
  viewer:   { icon: 'i-lucide-eye',              bg: 'bg-surface-2 text-(--color-muted)', label: 'Viewer' },
  operator: { icon: 'i-lucide-wrench',           bg: 'bg-sky-500/10 text-sky-300',        label: 'Operator' },
  manager:  { icon: 'i-lucide-clipboard-check',  bg: 'bg-amber-500/10 text-amber-300',    label: 'Manager' },
  admin:    { icon: 'i-lucide-shield-check',      bg: 'bg-beacon/10 text-beacon',          label: 'Admin' }
}
</script>

<template>
  <div>
    <PageHeader :title="`${appName} users`" subtitle="Everyone with access to this app and their role" icon="i-lucide-users">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" :disabled="!canView" @click="load" />
      </template>
    </PageHeader>

    <div v-if="!canView" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">Only managers and admins of {{ appName }} can view its users.</p>
    </div>

    <template v-else>
      <DataState
        :status="status"
        :error="error"
        :empty="!data.rows.length"
        :refreshing="refreshing"
        empty-label="No users have access to this app yet."
        empty-icon="i-lucide-users"
      >
        <div class="space-y-2">
          <div
            v-for="u in data.rows"
            :key="u.id"
            class="panel-flush grid grid-cols-2 items-center gap-3 p-3.5 sm:grid-cols-12"
          >
            <div class="col-span-2 min-w-0 sm:col-span-6">
              <div class="flex items-center gap-2.5">
                <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-(--color-muted) ring-1 ring-hull">
                  {{ (u.name || u.username || '?').slice(0, 2).toUpperCase() }}
                </span>
                <div class="min-w-0">
                  <p class="truncate font-medium text-foam">{{ u.name || u.username }}</p>
                  <p class="truncate font-mono text-xs text-faint">{{ u.username }}</p>
                </div>
              </div>
            </div>
            <div class="sm:col-span-4">
              <span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium capitalize" :class="TIER_META[u.tier].bg">
                <UIcon :name="TIER_META[u.tier].icon" class="size-3" />
                {{ TIER_META[u.tier].label }}
              </span>
            </div>
            <div class="text-xs text-faint sm:col-span-2">
              <span class="rounded bg-surface-2 px-1.5 py-0.5 uppercase">{{ u.source }}</span>
            </div>
          </div>
        </div>
      </DataState>

      <div v-if="data.total > PAGE_SIZE" class="mt-4 flex items-center justify-between gap-3">
        <p class="text-xs text-faint">{{ rangeLabel }}</p>
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="soft"
            size="sm"
            :disabled="page <= 1 || refreshing"
            aria-label="Previous page"
            @click="page = Math.max(1, page - 1)"
          />
          <span class="text-xs text-(--color-muted)">Page {{ page }} of {{ totalPages }}</span>
          <UButton
            icon="i-lucide-chevron-right"
            color="neutral"
            variant="soft"
            size="sm"
            :disabled="page >= totalPages || refreshing"
            aria-label="Next page"
            @click="page = Math.min(totalPages, page + 1)"
          />
        </div>
      </div>
    </template>
  </div>
</template>
