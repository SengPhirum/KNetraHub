<script setup lang="ts">
import { scopeLabel } from '~~/shared/utils/notifications'

// Navbar notification bell — the in-app view of the centralized feed
// (server/utils/notificationFeed.ts). Every alert engine (portal, Dock,
// Monitoring, IP Mgt) records into one store, so this list is cross-app. Rows
// are already scoped server-side to the apps the user is entitled to.
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

const { user } = useAuth()
const open = ref(false)
const items = ref<FeedItem[]>([])
const unread = ref(0)
const loading = ref(false)

async function load() {
  if (!user.value) return
  loading.value = true
  try {
    const data = await $fetch<{ items: FeedItem[]; unread: number }>('/api/notifications/feed', { query: { limit: 30 } })
    items.value = data.items
    unread.value = data.unread
  } catch {
    // A transient polling/session error must not disrupt the navbar.
  } finally {
    loading.value = false
  }
}

// Poll for the badge at a calm cadence; refresh immediately when opened so the
// list is current the moment the user looks at it.
let timer: ReturnType<typeof setInterval> | undefined
watch(user, (u) => {
  if (u && import.meta.client) {
    load()
    if (!timer) timer = setInterval(load, 60_000)
  } else if (timer) {
    clearInterval(timer)
    timer = undefined
    items.value = []
    unread.value = 0
  }
}, { immediate: true })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

watch(open, (isOpen) => { if (isOpen) load() })

async function markAllRead() {
  if (!unread.value) return
  const previous = items.value.map((i) => ({ ...i }))
  items.value = items.value.map((i) => ({ ...i, read: true }))
  unread.value = 0
  try {
    await $fetch('/api/notifications/feed/read', { method: 'POST', body: { all: true } })
  } catch {
    items.value = previous // put the badge back rather than lie about state
    await load()
  }
}

async function markRead(item: FeedItem) {
  if (item.read) return
  item.read = true
  unread.value = Math.max(0, unread.value - 1)
  try {
    await $fetch('/api/notifications/feed/read', { method: 'POST', body: { ids: [item.id] } })
  } catch {
    await load()
  }
}

const SEVERITY_META: Record<string, { icon: string; dot: string; badge: 'error' | 'warning' | 'info' | 'neutral'; label: string }> = {
  critical: { icon: 'i-lucide-circle-alert', dot: 'bg-rose-500', badge: 'error', label: 'Critical' },
  warning: { icon: 'i-lucide-triangle-alert', dot: 'bg-amber-500', badge: 'warning', label: 'Warning' },
  info: { icon: 'i-lucide-info', dot: 'bg-sky-500', badge: 'info', label: 'Info' }
}
function severityMeta(s: string) {
  return SEVERITY_META[s] ?? { icon: 'i-lucide-bell', dot: 'bg-slate-500', badge: 'neutral' as const, label: s }
}

/** Compact relative time ("3m", "2h", "5d") like a social feed. */
function timeAgo(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(then).toLocaleDateString()
}

const badgeLabel = computed(() => (unread.value > 99 ? '99+' : String(unread.value)))
</script>

<template>
  <UPopover v-if="user" v-model:open="open" :content="{ align: 'end', sideOffset: 8 }">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-bell"
      :aria-label="unread ? `Notifications (${unread} unread)` : 'Notifications'"
      class="relative"
    >
      <template #trailing>
        <span
          v-if="unread"
          class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-ink"
        >{{ badgeLabel }}</span>
      </template>
    </UButton>

    <template #content>
      <div class="w-[22rem] max-w-[calc(100vw-2rem)]">
        <header class="flex items-center justify-between border-b border-hull px-3 py-2">
          <div class="flex items-center gap-2">
            <p class="font-display text-sm font-semibold text-foam">Notifications</p>
            <UBadge v-if="unread" color="error" variant="subtle" size="sm" :label="`${unread} new`" />
          </div>
          <UButton
            v-if="unread"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-check-check"
            label="Mark all read"
            @click="markAllRead"
          />
        </header>

        <div class="max-h-[26rem] overflow-y-auto">
          <div v-if="loading && !items.length" class="px-3 py-10 text-center text-sm text-muted">Loading…</div>

          <div v-else-if="!items.length" class="px-3 py-10 text-center">
            <UIcon name="i-lucide-bell-off" class="mx-auto mb-2 size-6 text-faint" />
            <p class="text-sm text-muted">You're all caught up</p>
            <p class="mt-1 text-xs text-faint">Alerts from the portal and your apps show up here.</p>
          </div>

          <ul v-else class="divide-y divide-hull">
            <li
              v-for="item in items"
              :key="item.id"
              class="flex gap-3 px-3 py-3 transition-colors"
              :class="item.read ? 'hover:bg-surface-2/40' : 'bg-beacon/5 hover:bg-beacon/10'"
              @click="markRead(item)"
            >
              <UIcon :name="severityMeta(item.severity).icon" class="mt-0.5 size-4 shrink-0"
                :class="item.severity === 'critical' ? 'text-rose-400' : item.severity === 'warning' ? 'text-amber-400' : 'text-sky-400'" />

              <div class="min-w-0 flex-1">
                <div class="mb-1 flex flex-wrap items-center gap-1.5">
                  <UBadge color="neutral" variant="subtle" size="sm" :label="scopeLabel(item.app)" />
                  <UBadge :color="severityMeta(item.severity).badge" variant="subtle" size="sm" :label="severityMeta(item.severity).label" />
                  <span class="text-[11px] text-faint">{{ timeAgo(item.createdAt) }}</span>
                </div>
                <p class="truncate text-sm font-medium" :class="item.read ? 'text-(--color-muted)' : 'text-foam'">{{ item.title }}</p>
                <p class="line-clamp-2 text-xs text-faint">{{ item.body }}</p>
              </div>

              <span v-if="!item.read" class="mt-1.5 size-2 shrink-0 rounded-full" :class="severityMeta(item.severity).dot" aria-label="Unread" />
            </li>
          </ul>
        </div>
      </div>
    </template>
  </UPopover>
</template>
