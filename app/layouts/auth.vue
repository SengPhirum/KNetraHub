<script setup lang="ts">
// The hero panel doubles as a quick orientation to what KNetraHub actually is -
// a portal over several independent ops subsystems - rather than just branding.
// Keep this in sync with app/utils/moduleRegistry.ts if a module's pitch changes.
const heroFeatures = [
  { icon: 'i-lucide-container', label: 'Docker', description: 'Nodes, services, stacks, and data resources' },
  { icon: 'i-lucide-activity', label: 'Monitoring', description: 'Unified network + server health, alerts, and problems' },
  { icon: 'i-lucide-id-card', label: 'IP Management', description: 'Subnets, address inventory, and utilization' }
]

// Decorative "digital network" backdrop - a fixed constellation of nodes and
// links, pulsing and flowing via CSS animation only (no canvas/JS). Coordinates
// are hand-placed (not random) against a 1600x900 viewBox and cropped to cover
// the viewport via preserveAspectRatio, so it reads as a calm circuit/constellation
// behind the sign-in card rather than literal data.
const netNodes = [
  { x: 120, y: 150, r: 4, d: '0s' }, { x: 340, y: 90, r: 6, d: '0.6s' }, { x: 560, y: 220, r: 4, d: '1.2s' },
  { x: 760, y: 110, r: 5, d: '1.8s' }, { x: 980, y: 240, r: 4, d: '0.3s' }, { x: 1180, y: 120, r: 6, d: '0.9s' },
  { x: 1400, y: 220, r: 4, d: '1.5s' }, { x: 200, y: 430, r: 5, d: '2.1s' }, { x: 460, y: 500, r: 4, d: '0.4s' },
  { x: 700, y: 380, r: 6, d: '1s' }, { x: 940, y: 470, r: 4, d: '1.6s' }, { x: 1180, y: 400, r: 5, d: '2.2s' },
  { x: 1420, y: 480, r: 4, d: '0.7s' }, { x: 240, y: 720, r: 4, d: '1.3s' }, { x: 560, y: 760, r: 6, d: '1.9s' },
  { x: 900, y: 700, r: 4, d: '0.2s' }, { x: 1220, y: 760, r: 5, d: '0.8s' }, { x: 1440, y: 680, r: 4, d: '1.4s' }
]
const netLinks = [
  { x1: 120, y1: 150, x2: 340, y2: 90, d: '0s', dur: '5s' }, { x1: 340, y1: 90, x2: 560, y2: 220, d: '0.8s', dur: '6s' },
  { x1: 760, y1: 110, x2: 980, y2: 240, d: '1.6s', dur: '5.5s' }, { x1: 980, y1: 240, x2: 1180, y2: 120, d: '0.4s', dur: '6.5s' },
  { x1: 1180, y1: 120, x2: 1400, y2: 220, d: '1.2s', dur: '5s' }, { x1: 120, y1: 150, x2: 200, y2: 430, d: '2s', dur: '7s' },
  { x1: 980, y1: 240, x2: 1180, y2: 400, d: '0.6s', dur: '6s' }, { x1: 1400, y1: 220, x2: 1420, y2: 480, d: '1.4s', dur: '5.5s' },
  { x1: 460, y1: 500, x2: 700, y2: 380, d: '0.2s', dur: '6s' }, { x1: 700, y1: 380, x2: 940, y2: 470, d: '1s', dur: '5s' },
  { x1: 1180, y1: 400, x2: 1420, y2: 480, d: '1.8s', dur: '6.5s' }, { x1: 460, y1: 500, x2: 560, y2: 760, d: '0.5s', dur: '7s' },
  { x1: 940, y1: 470, x2: 900, y2: 700, d: '1.3s', dur: '5.5s' }, { x1: 1420, y1: 480, x2: 1440, y2: 680, d: '2.1s', dur: '6s' },
  { x1: 240, y1: 720, x2: 560, y2: 760, d: '0.7s', dur: '5s' }, { x1: 900, y1: 700, x2: 1220, y2: 760, d: '1.5s', dur: '6.5s' }
]
</script>

<template>
  <div class="relative min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <!-- Shared animated backdrop: dark base + soft glows + a pulsing node/link network -->
    <div class="net-backdrop" aria-hidden="true">
      <svg class="net-grid" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <line
          v-for="(l, i) in netLinks"
          :key="`l${i}`"
          class="net-link"
          :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2"
          :style="{ animationDelay: l.d, animationDuration: l.dur }"
        />
        <circle
          v-for="(n, i) in netNodes"
          :key="`n${i}`"
          class="net-node"
          :cx="n.x" :cy="n.y" :r="n.r"
          :style="{ animationDelay: n.d }"
        />
      </svg>
    </div>

    <div class="absolute right-4 top-4 z-20">
      <ThemeModeControl compact />
    </div>

    <!-- Hero / brand panel - the "what is this and why should I trust it" side. Hidden below lg; the form panel carries its own compact brand mark there. -->
    <aside class="relative hidden border-r border-hull lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
      <KNetraHubLogo size="lg" />

      <div class="max-w-md">
        <h2 class="font-display text-3xl font-semibold leading-tight text-foam xl:text-4xl">
          Command every layer of your infrastructure.
        </h2>
        <p class="mt-4 text-sm leading-relaxed text-(--color-muted)">
          KNetraHub unifies Docker Swarm orchestration, network &amp; server monitoring, and IP address
          management into a single operations console.
        </p>

        <ul class="mt-8 space-y-4">
          <li v-for="f in heroFeatures" :key="f.label" class="flex items-start gap-3">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 ring-1 ring-hull">
              <UIcon :name="f.icon" class="size-4 text-beacon" />
            </span>
            <div class="min-w-0">
              <p class="text-sm font-medium text-foam">{{ f.label }}</p>
              <p class="text-xs text-faint">{{ f.description }}</p>
            </div>
          </li>
        </ul>
      </div>

      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-faint">
        <span class="flex items-center gap-1.5"><UIcon name="i-lucide-lock" class="size-3.5" /> Encrypted credentials</span>
        <span class="flex items-center gap-1.5"><UIcon name="i-lucide-shield-check" class="size-3.5" /> Role-based access</span>
        <span class="flex items-center gap-1.5"><UIcon name="i-lucide-scroll-text" class="size-3.5" /> Full audit trail</span>
      </div>
    </aside>

    <!-- Form panel -->
    <div class="flex min-h-dvh items-center justify-center p-4 sm:p-8">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.net-backdrop {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background-color: var(--color-abyss);
  background-image:
    radial-gradient(1100px 600px at 12% -10%, var(--page-glow-1), transparent 60%),
    radial-gradient(900px 550px at 100% 105%, var(--page-glow-2), transparent 55%);
}
.net-grid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.net-node {
  fill: var(--color-beacon);
  opacity: 0.3;
  transform-box: fill-box;
  transform-origin: center;
  animation: net-pulse 4.5s ease-in-out infinite;
}
.net-link {
  stroke: var(--color-beacon);
  stroke-width: 1.25;
  stroke-dasharray: 7 11;
  opacity: 0.16;
  animation: net-flow 6s linear infinite;
}
@keyframes net-pulse {
  0%, 100% { opacity: 0.22; transform: scale(1); }
  50%      { opacity: 0.75; transform: scale(1.7); }
}
@keyframes net-flow {
  to { stroke-dashoffset: -180; }
}
@media (prefers-reduced-motion: reduce) {
  .net-node,
  .net-link {
    animation: none;
  }
}
</style>
