<script setup lang="ts">
import { scopeLabel, NOTIFICATION_APP_LABELS } from '~~/shared/utils/notifications'

// The full notification history — filters, paging, mark-as-read. Shared by the
// near-full-screen modal behind the navbar bell's "See all" and the standalone
// /notifications route, so both stay identical. Rows come from the centralized
// feed and are already scoped server-side to the apps this user may see.
const props = defineProps<{
  /** Fill the parent's height with an internally-scrolling list (modal usage). */
  fill?: boolean
}>()

const emit = defineEmits<{
  /** A row with a destination was clicked — the modal uses this to close. */
  navigate: []
  /** Read state changed, so a parent badge can refresh. */
  changed: []
}>()

interface FeedItem {
  id: string
  app: string
  severity: 'critical' | 'warning' | 'info' | string
  title: string
  body: string
  ruleType?: string
  target?: string
  createdAt: string
  read: boolean
}

const toast = useToast()
const PAGE_SIZE = 25

const appFilter = ref('')
const severityFilter = ref('')
const unreadOnly = ref(false)
const page = ref(0)

const items = ref<FeedItem[]>([])
const total = ref(0)
const unread = ref(0)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await $fetch<{ items: FeedItem[]; unread: number; total: number }>('/api/notifications/feed', {
      query: {
        limit: PAGE_SIZE,
        offset: page.value * PAGE_SIZE,
        ...(appFilter.value ? { app: appFilter.value } : {}),
        ...(severityFilter.value ? { severity: severityFilter.value } : {}),
        ...(unreadOnly.value ? { unread: '1' } : {})
      }
    })
    items.value = data.items
    total.value = data.total
    unread.value = data.unread
  } catch (e: any) {
    toast.add({ title: 'Could not load notifications', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    loading.value = false
  }
}
onMounted(load)
// Any filter change resets to the first page before reloading.
watch([appFilter, severityFilter, unreadOnly], () => { page.value = 0; load() })
watch(page, load)

/** Re-read from the server — used when the modal is reopened. */
defineExpose({ reload: load })

async function markAllRead() {
  if (!unread.value) return
  try {
    await $fetch('/api/notifications/feed/read', { method: 'POST', body: { all: true } })
    toast.add({ title: 'All notifications marked read', color: 'primary', icon: 'i-lucide-check' })
    await load()
    emit('changed')
  } catch (e: any) {
    toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

async function markRead(item: FeedItem) {
  if (!item.read) {
    item.read = true
    unread.value = Math.max(0, unread.value - 1)
    try {
      await $fetch('/api/notifications/feed/read', { method: 'POST', body: { ids: [item.id] } })
      emit('changed')
    } catch {
      await load()
    }
  }
  if (notificationLink(item)) emit('navigate')
}

const appItems = [
  { value: '', label: 'All apps' },
  ...Object.entries(NOTIFICATION_APP_LABELS)
    .filter(([key]) => key !== 'global')
    .map(([value, label]) => ({ value, label }))
]
const severityItems = [
  { value: '', label: 'All priorities' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' }
]

const SEVERITY_META: Record<string, { icon: string; badge: 'error' | 'warning' | 'info' | 'neutral'; label: string; dot: string }> = {
  critical: { icon: 'i-lucide-circle-alert', badge: 'error', label: 'Critical', dot: 'bg-rose-500' },
  warning: { icon: 'i-lucide-triangle-alert', badge: 'warning', label: 'Warning', dot: 'bg-amber-500' },
  info: { icon: 'i-lucide-info', badge: 'info', label: 'Info', dot: 'bg-sky-500' }
}
function severityMeta(s: string) {
  return SEVERITY_META[s] ?? { icon: 'i-lucide-bell', badge: 'neutral' as const, label: s, dot: 'bg-slate-500' }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
</script>

<template>
  <div :class="props.fill ? 'flex h-full min-h-0 flex-col gap-3' : 'space-y-4'">
    <!-- filters -->
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <USelect v-model="appFilter" :items="appItems" value-key="value" label-key="label" size="sm" class="w-44" />
      <USelect v-model="severityFilter" :items="severityItems" value-key="value" label-key="label" size="sm" class="w-44" />
      <UCheckbox v-model="unreadOnly" label="Unread only" />
      <div class="flex-1" />
      <p class="text-xs text-faint">{{ total }} notification{{ total === 1 ? '' : 's' }}</p>
      <UButton
        v-if="unread"
        size="xs"
        color="neutral"
        variant="soft"
        icon="i-lucide-check-check"
        :label="`Mark all read (${unread})`"
        @click="markAllRead"
      />
    </div>

    <!-- list -->
    <div class="panel overflow-hidden" :class="props.fill ? 'min-h-0 flex-1 overflow-y-auto' : ''">
      <div v-if="loading && !items.length" class="px-4 py-12 text-center text-sm text-muted">Loading…</div>

      <div v-else-if="!items.length" class="px-4 py-12 text-center">
        <UIcon name="i-lucide-bell-off" class="mx-auto mb-2 size-7 text-faint" />
        <p class="text-sm text-muted">No notifications match these filters</p>
      </div>

      <ul v-else class="divide-y divide-hull">
        <li v-for="item in items" :key="item.id">
          <component
            :is="notificationLink(item) ? 'NuxtLink' : 'div'"
            :to="notificationLink(item) || undefined"
            class="flex gap-3 px-4 py-3.5 transition-colors"
            :class="[
              item.read ? 'hover:bg-surface-2/40' : 'bg-beacon/5 hover:bg-beacon/10',
              notificationLink(item) ? 'cursor-pointer' : ''
            ]"
            @click="markRead(item)"
          >
            <UIcon :name="severityMeta(item.severity).icon" class="mt-0.5 size-4 shrink-0"
              :class="item.severity === 'critical' ? 'text-rose-400' : item.severity === 'warning' ? 'text-amber-400' : 'text-sky-400'" />

            <div class="min-w-0 flex-1">
              <div class="mb-1 flex flex-wrap items-center gap-1.5">
                <UBadge color="neutral" variant="subtle" size="sm" :label="scopeLabel(item.app)" />
                <UBadge :color="severityMeta(item.severity).badge" variant="subtle" size="sm" :label="severityMeta(item.severity).label" />
                <span class="text-[11px] text-faint">{{ formatTime(item.createdAt) }}</span>
              </div>
              <p class="text-sm font-medium" :class="item.read ? 'text-(--color-muted)' : 'text-foam'">{{ item.title }}</p>
              <p class="whitespace-pre-line text-xs text-faint">{{ item.body }}</p>
            </div>

            <span v-if="!item.read" class="mt-1.5 size-2 shrink-0 rounded-full" :class="severityMeta(item.severity).dot" aria-label="Unread" />
          </component>
        </li>
      </ul>
    </div>

    <!-- paging -->
    <div v-if="pageCount > 1" class="flex shrink-0 items-center justify-between">
      <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-chevron-left" label="Newer"
        :disabled="page === 0" @click="page = Math.max(0, page - 1)" />
      <p class="text-xs text-faint">Page {{ page + 1 }} of {{ pageCount }}</p>
      <UButton size="xs" color="neutral" variant="soft" trailing-icon="i-lucide-chevron-right" label="Older"
        :disabled="page + 1 >= pageCount" @click="page = page + 1" />
    </div>
  </div>
</template>
