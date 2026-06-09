<script setup lang="ts">
const props = defineProps<{ collapsed?: boolean }>()
const emit = defineEmits<{ navigate: [] }>()

const groups = useNav()
const { user, can } = useAuth()
const route = useRoute()

const visibleGroups = computed(() =>
  groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.minRole || can(i.minRole)) }))
    .filter((g) => g.items.length)
)

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- wordmark -->
    <NuxtLink
      to="/"
      class="flex items-center gap-2.5 px-4 h-16 shrink-0 border-b border-[var(--color-hull-soft)]"
      @click="emit('navigate')"
    >
      <span class="sonar flex size-8 items-center justify-center rounded-lg bg-[var(--color-beacon)]/15 ring-1 ring-[var(--color-beacon)]/40">
        <UIcon name="i-lucide-ship-wheel" class="size-5 text-[var(--color-beacon)]" />
      </span>
      <span class="font-display text-lg font-semibold tracking-tight text-[var(--color-foam)]">DockHub</span>
    </NuxtLink>

    <!-- nav -->
    <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-6">
      <div v-for="group in visibleGroups" :key="group.label">
        <p class="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
          {{ group.label }}
        </p>
        <ul class="space-y-0.5">
          <li v-for="item in group.items" :key="item.to">
            <NuxtLink
              :to="item.to"
              class="group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors"
              :class="isActive(item.to)
                ? 'bg-[var(--color-beacon)]/12 text-[var(--color-foam)] ring-1 ring-inset ring-[var(--color-beacon)]/30'
                : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-foam)]'"
              @click="emit('navigate')"
            >
              <UIcon
                :name="item.icon"
                class="size-4.5 shrink-0"
                :class="isActive(item.to) ? 'text-[var(--color-beacon)]' : 'text-[var(--color-faint)] group-hover:text-[var(--color-muted)]'"
              />
              <span class="font-medium">{{ item.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </div>
    </nav>

    <!-- account -->
    <div class="border-t border-[var(--color-hull-soft)] p-3">
      <div class="flex items-center gap-3 rounded-lg px-2 py-1.5">
        <span class="flex size-9 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-sm font-semibold text-[var(--color-foam)] ring-1 ring-[var(--color-hull)]">
          {{ (user?.displayName || '?').charAt(0).toUpperCase() }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-[var(--color-foam)]">{{ user?.displayName }}</p>
          <p class="truncate text-xs text-[var(--color-faint)] capitalize">{{ user?.role }} · {{ user?.source }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
