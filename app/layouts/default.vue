<script setup lang="ts">
const { user, logout, can } = useAuth()
const { fetchPreferences } = usePreferences()
const userNotifications = useUserNotifications()
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
  if (u) {
    await fetchPreferences().catch(() => null)
    await userNotifications.start()
  } else {
    userNotifications.stop()
  }
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

// Decorative "digital infrastructure & security" background for the portal
// home only - a circuit-board trace grid with traveling data packets, a
// couple of "secured node" shield pulses, a periodic security-scan sweep, and
// ambient rising data bits. All coordinates/timings are deterministic
// (index-based math, never Math.random()) so SSR and client hydration agree.
const circuitNodes = [
  { x: 150, y: 120 }, { x: 420, y: 200 }, { x: 700, y: 130 }, { x: 980, y: 210 },
  { x: 1250, y: 140 }, { x: 1460, y: 260 }, { x: 150, y: 430 }, { x: 460, y: 470 },
  { x: 760, y: 400 }, { x: 1040, y: 480 }, { x: 1340, y: 420 },
  { x: 260, y: 700 }, { x: 600, y: 660 }, { x: 940, y: 720 }, { x: 1280, y: 660 }
]
// [fromNodeIndex, toNodeIndex, elbowStyle] - elbowStyle picks whether the
// single right-angle bend goes horizontal-then-vertical or vice versa, so the
// grid reads as circuit traces rather than a diagonal constellation.
const circuitLinks: [number, number, 'h' | 'v'][] = [
  [0, 1, 'h'], [1, 2, 'v'], [2, 3, 'h'], [3, 4, 'v'], [4, 5, 'h'],
  [0, 6, 'v'], [3, 9, 'v'], [5, 10, 'v'],
  [6, 7, 'h'], [7, 8, 'v'], [8, 9, 'h'], [9, 10, 'h'],
  [7, 11, 'v'], [8, 12, 'v'], [9, 13, 'v'], [10, 14, 'v']
]
function elbowPath(a: number, b: number, style: 'h' | 'v') {
  const from = circuitNodes[a]!
  const to = circuitNodes[b]!
  return style === 'h' ? `M${from.x},${from.y} H${to.x} V${to.y}` : `M${from.x},${from.y} V${to.y} H${to.x}`
}
const circuitTraces = circuitLinks.map(([a, b, style], i) => ({
  d: elbowPath(a, b, style),
  duration: `${6 + (i % 5)}s`,
  delay: `${((i * 0.35) % 3).toFixed(2)}s`
}))

// A few nodes double as "secured" checkpoints - a pulsing hexagon/shield
// outline in the running-green used for healthy status elsewhere in the app.
function hexPoints(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`
  }).join(' ')
}
const shieldNodeIndexes = [4, 8, 13]
const shieldHexes = shieldNodeIndexes.map((idx, i) => ({
  points: hexPoints(circuitNodes[idx]!.x, circuitNodes[idx]!.y, 22),
  delay: `${i * 1.6}s`
}))

// Ambient data bits drifting up through the stack (the digital-infra take on
// the old "bubbles").
const dataMotes = Array.from({ length: 16 }, (_, i) => {
  const n = i + 1
  return {
    left: `${(n * 41) % 100}%`,
    size: `${3 + ((n * 47) % 6)}px`,
    duration: `${14 + ((n * 31) % 20)}s`,
    delay: `${-((n * 19) % 24)}s`
  }
})
</script>

<template>
  <div class="min-h-dvh">
    <!-- Decorative animated "digital infrastructure & security" backdrop -
         portal home only. Calm, dense ops pages elsewhere stay free of motion. -->
    <div v-if="isHome" class="home-bg" aria-hidden="true">
      <div class="home-bg-glow home-bg-glow-1" />
      <div class="home-bg-glow home-bg-glow-2" />

      <svg class="home-bg-circuit" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <path v-for="(t, i) in circuitTraces" :key="`trace${i}`" class="circuit-trace" :d="t.d" />
        <circle
          v-for="(t, i) in circuitTraces"
          :key="`packet${i}`"
          class="circuit-packet"
          r="2.5"
          :style="{ offsetPath: `path('${t.d}')`, animationDuration: t.duration, animationDelay: t.delay }"
        />
        <circle
          v-for="(n, i) in circuitNodes"
          :key="`node${i}`"
          class="circuit-node"
          :cx="n.x" :cy="n.y" r="4"
          :style="{ animationDelay: `${(i * 0.4) % 4}s` }"
        />
        <polygon
          v-for="(h, i) in shieldHexes"
          :key="`shield${i}`"
          class="circuit-shield"
          :points="h.points"
          :style="{ animationDelay: h.delay }"
        />
      </svg>

      <div class="home-bg-scanbeam" />

      <div class="home-bg-motes">
        <span
          v-for="(m, i) in dataMotes"
          :key="i"
          class="home-bg-mote"
          :style="{ left: m.left, width: m.size, height: m.size, animationDuration: m.duration, animationDelay: m.delay }"
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
   A circuit-board trace grid with traveling "data packet" pulses, a couple
   of pulsing shield/hexagon "secured node" checkpoints, a periodic security
   scan sweep, and ambient data bits rising through the stack - reads as IT
   infrastructure + security rather than generic chrome. Fixed + clipped so
   it never affects page scroll size; z-indexed below the main column so all
   content stays fully readable. */
.home-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.home-bg-glow {
  position: absolute;
  border-radius: 9999px;
  filter: blur(80px);
  will-change: transform;
}
.home-bg-glow-1 {
  top: -16%;
  left: -10%;
  width: 46rem;
  height: 46rem;
  background: radial-gradient(circle, var(--color-beacon), transparent 65%);
  opacity: 0.35;
  animation: home-glow-drift-1 28s ease-in-out infinite;
}
.home-bg-glow-2 {
  bottom: -20%;
  right: -12%;
  width: 40rem;
  height: 40rem;
  background: radial-gradient(circle, var(--color-depth), transparent 65%);
  opacity: 0.3;
  animation: home-glow-drift-2 34s ease-in-out infinite;
}
@keyframes home-glow-drift-1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(6%, 8%) scale(1.12); }
}
@keyframes home-glow-drift-2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-8%, -6%) scale(1.08); }
}

/* Circuit-board wireframe: static right-angle traces + chip-like nodes, with
   a bright "packet" traveling each trace and a few nodes marked as secured
   checkpoints via a pulsing hexagon/shield outline. */
.home-bg-circuit {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.circuit-trace {
  fill: none;
  stroke: var(--color-beacon);
  stroke-width: 1;
  opacity: 0.14;
}
.circuit-node {
  fill: var(--color-beacon);
  opacity: 0.3;
  transform-box: fill-box;
  transform-origin: center;
  animation: home-node-blink 4.5s ease-in-out infinite;
}
.circuit-packet {
  fill: var(--color-depth);
  filter: drop-shadow(0 0 3px var(--color-beacon)) drop-shadow(0 0 6px var(--color-beacon));
  offset-rotate: 0deg;
  animation-name: home-packet-travel;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.circuit-shield {
  fill: none;
  stroke: var(--color-running);
  stroke-width: 1.5;
  opacity: 0;
  filter: drop-shadow(0 0 4px var(--color-running));
  transform-box: fill-box;
  transform-origin: center;
  animation: home-shield-pulse 5s ease-in-out infinite;
}
@keyframes home-node-blink {
  0%, 100% { opacity: 0.2; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}
@keyframes home-packet-travel {
  0% { offset-distance: 0%; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { offset-distance: 100%; opacity: 0; }
}
@keyframes home-shield-pulse {
  0%, 100% { opacity: 0.2; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.1); }
}

/* Periodic security-scan sweep crossing the page, like a vulnerability/host
   scan pass, then a pause before the next cycle. */
.home-bg-scanbeam {
  position: absolute;
  top: -10%;
  left: 0;
  width: 34%;
  height: 130%;
  background: linear-gradient(
    100deg,
    transparent 0%,
    transparent 35%,
    color-mix(in srgb, var(--color-beacon) 16%, transparent) 48%,
    color-mix(in srgb, var(--color-depth) 26%, transparent) 50%,
    color-mix(in srgb, var(--color-beacon) 16%, transparent) 52%,
    transparent 65%,
    transparent 100%
  );
  transform: translateX(-120%) skewX(-14deg);
  animation: home-scan-sweep 10s cubic-bezier(0.3, 0, 0.3, 1) infinite;
}
@keyframes home-scan-sweep {
  0% { transform: translateX(-120%) skewX(-14deg); }
  45% { transform: translateX(340%) skewX(-14deg); }
  100% { transform: translateX(340%) skewX(-14deg); }
}

/* Ambient data bits drifting up through the stack. */
.home-bg-motes {
  position: absolute;
  inset: 0;
}
.home-bg-mote {
  position: absolute;
  bottom: -5%;
  border-radius: 2px;
  background: var(--color-depth);
  box-shadow: 0 0 6px var(--color-depth);
  opacity: 0;
  animation-name: home-mote-rise;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform, opacity;
}
@keyframes home-mote-rise {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
  6% { opacity: 0.45; }
  92% { opacity: 0.22; }
  100% { transform: translate(14px, -112vh) rotate(90deg); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .home-bg-glow,
  .circuit-node,
  .circuit-packet,
  .circuit-shield,
  .home-bg-scanbeam,
  .home-bg-mote {
    animation: none;
  }
}
</style>
