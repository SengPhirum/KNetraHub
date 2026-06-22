<script setup lang="ts">
const { user, logout } = useAuth()
const { fetchPreferences } = usePreferences()
const route = useRoute()
const mobileOpen = ref(false)

// close the mobile drawer on navigation
watch(() => route.fullPath, () => { mobileOpen.value = false })

// Load user preferences once after auth is hydrated
watch(user, async (u) => {
  if (u) await fetchPreferences().catch(() => null)
}, { immediate: true })

const userMenu = computed(() => [
  [{ label: user.value?.displayName || '', type: 'label' as const }],
  [{ label: 'Preferences', icon: 'i-lucide-sliders-horizontal', to: '/preferences' }],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: () => logout() }]
])

const { appearance } = useAppearance()
</script>

<template>
  <div class="min-h-dvh">
    <!-- Desktop sidebar (fixed) -->
    <aside class="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col panel-flush border-y-0 border-l-0 z-30">
      <SidebarNav />
    </aside>

    <!-- Mobile drawer -->
    <USlideover v-model:open="mobileOpen" side="left" :ui="{ content: 'w-[17rem] bg-abyss ring-1 ring-hull' }">
      <template #content>
        <SidebarNav @navigate="mobileOpen = false" />
      </template>
    </USlideover>

    <!-- Main column -->
    <div class="lg:pl-64 flex min-h-dvh flex-col">
      <!-- top bar -->
      <header class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-hull-soft bg-ink/85 px-4 backdrop-blur-md sm:px-6">
        <UButton
          class="lg:hidden"
          icon="i-lucide-menu"
          color="neutral"
          variant="ghost"
          aria-label="Open navigation"
          @click="mobileOpen = true"
        />

        <div class="flex min-w-0 items-center gap-3">
          <DockHubLogo variant="icon" class="size-8 shrink-0 drop-shadow-[0_10px_18px_rgba(8,41,68,0.18)]" />
          <div class="min-w-0">
            <div class="flex items-center gap-2 text-sm">
              <span class="dot dot-running" />
              <span class="truncate font-display text-sm font-semibold tracking-tight text-foam">{{ appearance.appName }}</span>
            </div>
          </div>
        </div>

        <div class="flex-1" />

        <ThemeModeControl compact />

        <UButton
          to="/stacks"
          icon="i-lucide-upload"
          color="primary"
          variant="soft"
          class="hidden sm:inline-flex"
          label="Deploy stack"
        />

        <!-- User menu — skeleton while loading -->
        <template v-if="user">
          <UDropdownMenu :items="userMenu" :content="{ align: 'end' }">
            <UButton color="neutral" variant="ghost" trailing-icon="i-lucide-chevron-down">
              <span class="flex size-7 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold ring-1 ring-hull">
                {{ (user.displayName || '?').charAt(0).toUpperCase() }}
              </span>
              <span class="hidden sm:inline text-sm">{{ user.displayName || user.username }}</span>
            </UButton>
          </UDropdownMenu>
        </template>
        <template v-else>
          <!-- Prevents layout shift during auth hydration -->
          <div class="skeleton h-8 w-28 rounded-lg" />
        </template>
      </header>

      <!-- page -->
      <main class="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <slot />
      </main>
    </div>
  </div>
</template>
