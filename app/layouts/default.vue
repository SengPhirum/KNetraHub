<script setup lang="ts">
const { user, logout, can } = useAuth()
const { fetchPreferences } = usePreferences()
const route = useRoute()
const mobileOpen = ref(false)

// The portal home (/) is a full-page launcher with no sidebar; every other
// route keeps the contextual sidebar. Portal admins open the sidebar/admin
// experience from the home page's Admin button (-> /admin).
const isHome = computed(() => route.path === '/')

// Whether we're inside one of the apps (Dock/Net/Server/IPMgt). Used to surface
// a clear "leave this app, back to the portal launcher" button in the header.
const inApp = computed(() => appKeyForRoute(route.path) !== null)

// Current app's display name (Docker / Monitoring / IP Management), used for
// the "Exit {App}" header button.
const currentAppName = computed(() => {
  const key = appKeyForRoute(route.path)
  return key ? getModuleRegistry().find((m) => m.key === key)?.name : undefined
})

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
    <!-- Desktop sidebar (fixed) - hidden on the full-page portal home -->
    <aside v-if="!isHome" class="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col panel-flush border-y-0 border-l-0 z-30">
      <SidebarNav />
    </aside>

    <!-- Mobile drawer -->
    <USlideover v-if="!isHome" v-model:open="mobileOpen" side="left" :ui="{ content: 'w-[17rem] bg-abyss ring-1 ring-hull' }">
      <template #content>
        <SidebarNav @navigate="mobileOpen = false" />
      </template>
    </USlideover>

    <!-- Main column -->
    <div class="flex min-h-dvh flex-col" :class="{ 'lg:pl-64': !isHome }">
      <!-- top bar -->
      <header class="sticky top-0 z-20 flex h-20 items-center gap-3 border-b border-hull-soft bg-ink/85 px-4 backdrop-blur-md sm:px-6">
        <UButton
          v-if="!isHome"
          class="lg:hidden"
          icon="i-lucide-menu"
          color="neutral"
          variant="ghost"
          aria-label="Open navigation"
          @click="mobileOpen = true"
        />

        <!-- Clear "leave this app, back to the portal launcher" affordance,
             shown only while inside an app (Dock/Net/Server/IPMgt). -->
        <UButton
          v-if="inApp"
          to="/"
          icon="i-lucide-door-open"
          color="neutral"
          variant="soft"
          :label="currentAppName ? `Exit ${currentAppName}` : 'Exit'"
          :title="currentAppName ? `Exit ${currentAppName}, back to all apps` : 'Back to all apps'"
          class="shrink-0"
        />

        <div v-if="isHome" class="flex min-w-0 items-center gap-3">
          <KNetraHubLogo variant="icon" class="size-8 shrink-0 drop-shadow-[0_10px_18px_rgba(8,41,68,0.18)]" />
          <div class="min-w-0">
            <div class="flex items-center gap-2 text-sm">
              <span class="dot dot-running" />
              <span class="truncate font-display text-sm font-semibold tracking-tight text-foam">{{ appearance.appName }}</span>
            </div>
          </div>
        </div>

        <div class="flex-1" />

        <ThemeModeControl compact />

        <!-- Admin entry: only on the full-page home, only for portal admins.
             Opens the sidebar/admin experience (the AS-IS launcher with nav). -->
        <UButton
          v-if="isHome && can('admin')"
          to="/admin"
          icon="i-lucide-wrench"
          color="neutral"
          variant="soft"
          label="Admin"
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

      <!-- Full-width portal footer (home only): Documentation left, credit right -->
      <footer
        v-if="isHome"
        class="flex flex-col items-center gap-3 border-t border-hull-soft px-4 py-4 text-[11px] sm:flex-row sm:justify-between sm:px-6 lg:px-8"
      >
        <NuxtLink
          to="/documentation"
          class="inline-flex items-center gap-1.5 font-medium text-(--color-muted) transition-colors hover:text-foam"
        >
          <UIcon name="i-lucide-book-open-text" class="size-3.5" />
          <span>Documentation</span>
        </NuxtLink>

        <p class="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-faint">
          <span>Made with</span>
          <span class="font-medium text-running">&#9829;</span>
          <span>by</span>
          <a
            href="https://github.com/sengphirum"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 font-semibold text-beacon transition-colors hover:text-foam"
          >
            <UIcon name="i-lucide-github" class="size-3.5" />
            <span>Seng Phirum</span>
          </a>
        </p>
      </footer>
    </div>
  </div>
</template>
