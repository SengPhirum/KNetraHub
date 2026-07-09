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
const appVersion = useRuntimeConfig().public.appVersion
const buildDate = useRuntimeConfig().public.buildDate
const buildDateLabel = computed(() => {
  const d = new Date(buildDate)
  if (Number.isNaN(d.getTime())) return ''
  const datePart = d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
  const timePart = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${datePart} ${timePart}`
})

// Decorative "ocean depth" background for the portal home only - deterministic
// per-index math (not Math.random()) so SSR and client hydration agree on
// every bubble's position/timing.
const bubbles = Array.from({ length: 16 }, (_, i) => {
  const n = i + 1
  return {
    left: `${(n * 37) % 100}%`,
    size: `${6 + ((n * 53) % 20)}px`,
    duration: `${16 + ((n * 29) % 18)}s`,
    delay: `${-((n * 17) % 20)}s`
  }
})
</script>

<template>
  <div class="min-h-dvh">
    <!-- Decorative animated "ocean depth" backdrop - portal home only. Calm,
         dense ops pages elsewhere stay free of motion. -->
    <div v-if="isHome" class="home-bg" aria-hidden="true">
      <div class="home-bg-aurora home-bg-aurora-1" />
      <div class="home-bg-aurora home-bg-aurora-2" />
      <div class="home-bg-aurora home-bg-aurora-3" />
      <div class="home-bg-sonar" />
      <div class="home-bg-bubbles">
        <span
          v-for="(b, i) in bubbles"
          :key="i"
          class="home-bg-bubble"
          :style="{ left: b.left, width: b.size, height: b.size, animationDuration: b.duration, animationDelay: b.delay }"
        />
      </div>
    </div>

    <!-- Desktop sidebar (fixed) - hidden on the full-page portal home -->
    <aside v-if="!isHome" class="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col sidebar-shell border-y-0 border-l-0 z-30">
      <SidebarNav />
    </aside>

    <!-- Mobile drawer -->
    <USlideover v-if="!isHome" v-model:open="mobileOpen" side="left" :ui="{ content: 'w-[17rem] sidebar-shell' }">
      <template #content>
        <SidebarNav @navigate="mobileOpen = false" />
      </template>
    </USlideover>

    <!-- Main column -->
    <div class="relative z-10 flex min-h-dvh flex-col" :class="{ 'lg:pl-64': !isHome }">
      <!-- top bar -->
      <header class="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-hull-soft bg-ink/85 px-4 backdrop-blur-md sm:px-6">
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

        <p class="text-faint">
          v{{ appVersion }}
          <ClientOnly><span v-if="buildDateLabel"> &middot; {{ buildDateLabel }}</span></ClientOnly>
        </p>

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

<style scoped>
/* ─── Portal home decorative backdrop ──────────────────────────────────────
   Slow-drifting depth-color "aurora" blobs, a periodic sonar sweep, and
   bubbles rising from the ocean floor - echoes the console's own nautical
   vocabulary (ink/abyss/hull/foam/beacon/depth, the sonar pulse) instead of
   being generic chrome. Fixed + clipped so it never affects page scroll size;
   z-indexed below the main column so all content stays fully readable. */
.home-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.home-bg-aurora {
  position: absolute;
  border-radius: 9999px;
  filter: blur(70px);
  will-change: transform;
}
.home-bg-aurora-1 {
  top: -14%;
  left: -10%;
  width: 46rem;
  height: 46rem;
  background: radial-gradient(circle, var(--color-beacon), transparent 65%);
  opacity: 0.5;
  animation: home-aurora-drift-1 26s ease-in-out infinite;
}
.home-bg-aurora-2 {
  bottom: -20%;
  right: -12%;
  width: 40rem;
  height: 40rem;
  background: radial-gradient(circle, var(--color-depth), transparent 65%);
  opacity: 0.4;
  animation: home-aurora-drift-2 32s ease-in-out infinite;
}
.home-bg-aurora-3 {
  top: 32%;
  left: 48%;
  width: 30rem;
  height: 30rem;
  background: radial-gradient(circle, var(--color-running), transparent 70%);
  opacity: 0.18;
  animation: home-aurora-drift-3 38s ease-in-out infinite;
}
@keyframes home-aurora-drift-1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(6%, 8%) scale(1.12); }
}
@keyframes home-aurora-drift-2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-8%, -6%) scale(1.08); }
}
@keyframes home-aurora-drift-3 {
  0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.14; }
  50% { transform: translate(-6%, -10%) scale(1.18); opacity: 0.26; }
}

/* Periodic sonar sweep from center, echoing the .sonar "live" pulse used
   elsewhere but scaled up to read as a slow radar scan across the page. */
.home-bg-sonar {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1px;
  height: 1px;
}
.home-bg-sonar::before,
.home-bg-sonar::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 60px;
  height: 60px;
  margin: -30px;
  border-radius: 9999px;
  border: 1px solid var(--color-beacon);
  opacity: 0;
  animation: home-sonar-ping 8s ease-out infinite;
}
.home-bg-sonar::after {
  animation-delay: 4s;
}
@keyframes home-sonar-ping {
  0% { transform: scale(1); opacity: 0.3; }
  100% { transform: scale(26); opacity: 0; }
}

/* Bubbles rising from the ocean floor - the "abyss/depth/foam" theme, made literal. */
.home-bg-bubbles {
  position: absolute;
  inset: 0;
}
.home-bg-bubble {
  position: absolute;
  bottom: -10%;
  border-radius: 9999px;
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4), var(--color-depth) 45%, transparent 75%);
  opacity: 0;
  animation-name: home-bubble-rise;
  animation-timing-function: ease-in;
  animation-iteration-count: infinite;
  will-change: transform, opacity;
}
@keyframes home-bubble-rise {
  0% { transform: translate(0, 0); opacity: 0; }
  8% { opacity: 0.32; }
  85% { opacity: 0.18; }
  100% { transform: translate(14px, -115vh); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .home-bg-aurora,
  .home-bg-bubble,
  .home-bg-sonar::before,
  .home-bg-sonar::after {
    animation: none;
  }
}
</style>
