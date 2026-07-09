<script setup lang="ts">
// The hero panel doubles as a quick orientation to what KNetraHub actually is -
// a portal over several independent ops subsystems - rather than just branding.
// Keep this in sync with app/utils/moduleRegistry.ts if a module's pitch changes.
const heroFeatures = [
  { icon: 'i-lucide-container', label: 'Docker', description: 'Nodes, services, stacks, and data resources' },
  { icon: 'i-lucide-activity', label: 'Monitoring', description: 'Unified network + server health, alerts, and problems' },
  { icon: 'i-lucide-id-card', label: 'IP Management', description: 'Subnets, address inventory, and utilization' }
]

// Decorative background texture: a calm geometric network (static lines, dots,
// a few outline triangles) with the motion carried entirely by raw CSS @keyframes
// loops - a bright "pulse" traveling along each line (CSS offset-path), dots
// breathing in place, triangles slowly drifting/rotating. No JS animation, no
// canvas; the arrays below are just fixed layout data for a 1600x900 viewBox
// that gets cropped to cover the viewport.
const netNodes = [
  { x: 120, y: 150, r: 4, d: '0s' }, { x: 340, y: 90, r: 5, d: '0.6s' }, { x: 560, y: 220, r: 3, d: '1.2s' },
  { x: 760, y: 110, r: 4, d: '1.8s' }, { x: 980, y: 240, r: 3, d: '0.3s' }, { x: 1180, y: 120, r: 5, d: '0.9s' },
  { x: 1400, y: 220, r: 3, d: '1.5s' }, { x: 200, y: 430, r: 4, d: '2.1s' }, { x: 460, y: 500, r: 3, d: '0.4s' },
  { x: 700, y: 380, r: 5, d: '1s' }, { x: 940, y: 470, r: 3, d: '1.6s' }, { x: 1180, y: 400, r: 4, d: '2.2s' },
  { x: 1420, y: 480, r: 3, d: '0.7s' }, { x: 240, y: 720, r: 3, d: '1.3s' }, { x: 560, y: 760, r: 5, d: '1.9s' },
  { x: 900, y: 700, r: 3, d: '0.2s' }, { x: 1220, y: 760, r: 4, d: '0.8s' }, { x: 1440, y: 680, r: 3, d: '1.4s' }
]
const netLinks = [
  { x1: 120, y1: 150, x2: 340, y2: 90, d: '0s', dur: '6s' }, { x1: 340, y1: 90, x2: 560, y2: 220, d: '0.9s', dur: '7s' },
  { x1: 760, y1: 110, x2: 980, y2: 240, d: '1.8s', dur: '6.5s' }, { x1: 980, y1: 240, x2: 1180, y2: 120, d: '0.4s', dur: '7.5s' },
  { x1: 1180, y1: 120, x2: 1400, y2: 220, d: '1.3s', dur: '6s' }, { x1: 120, y1: 150, x2: 200, y2: 430, d: '2.2s', dur: '8s' },
  { x1: 980, y1: 240, x2: 1180, y2: 400, d: '0.6s', dur: '7s' }, { x1: 1400, y1: 220, x2: 1420, y2: 480, d: '1.6s', dur: '6.5s' },
  { x1: 460, y1: 500, x2: 700, y2: 380, d: '0.2s', dur: '7s' }, { x1: 700, y1: 380, x2: 940, y2: 470, d: '1.1s', dur: '6s' },
  { x1: 1180, y1: 400, x2: 1420, y2: 480, d: '2s', dur: '7.5s' }, { x1: 460, y1: 500, x2: 560, y2: 760, d: '0.5s', dur: '8s' },
  { x1: 940, y1: 470, x2: 900, y2: 700, d: '1.4s', dur: '6.5s' }, { x1: 1420, y1: 480, x2: 1440, y2: 680, d: '2.3s', dur: '7s' },
  { x1: 240, y1: 720, x2: 560, y2: 760, d: '0.8s', dur: '6s' }, { x1: 900, y1: 700, x2: 1220, y2: 760, d: '1.7s', dur: '7.5s' }
]
const netTriangles = [
  { points: '160,300 197,357 123,357', d: '0s', dur: '11s' },
  { points: '1040,160 1077,217 1003,217', d: '2.5s', dur: '13s' },
  { points: '620,600 657,657 583,657', d: '1.2s', dur: '10s' },
  { points: '1340,560 1377,617 1303,617', d: '3.4s', dur: '12s' },
  { points: '860,320 890,368 830,368', d: '0.6s', dur: '9s' }
]

const appVersion = useRuntimeConfig().public.appVersion
</script>

<template>
  <div class="relative min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <!-- Shared background texture: dark base + soft glows + a geometric network -->
    <div class="net-backdrop" aria-hidden="true">
      <svg class="net-grid" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <line
          v-for="(l, i) in netLinks"
          :key="`l${i}`"
          class="net-link"
          :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2"
        />
        <circle
          v-for="(l, i) in netLinks"
          :key="`p${i}`"
          class="net-pulse"
          r="2.5"
          :style="{ offsetPath: `path('M${l.x1},${l.y1} L${l.x2},${l.y2}')`, animationDuration: l.dur, animationDelay: l.d }"
        />
        <polygon
          v-for="(t, i) in netTriangles"
          :key="`t${i}`"
          class="net-tri"
          :points="t.points"
          :style="{ animationDuration: t.dur, animationDelay: t.d }"
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
    <aside class="relative hidden lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
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

    <footer class="pointer-events-none fixed inset-x-0 bottom-0 z-10 py-2 text-center text-[11px] text-faint">
      v{{ appVersion }}
    </footer>
  </div>
</template>

<style scoped>
.net-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
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

/* Static wireframe - the calm "texture" layer, no motion of its own */
.net-link {
  stroke: var(--color-beacon);
  stroke-width: 1;
  fill: none;
  opacity: 0.12;
}
.net-node {
  fill: var(--color-beacon);
  opacity: 0.28;
  transform-box: fill-box;
  transform-origin: center;
  animation: net-breathe 5s ease-in-out infinite;
}

/* Motion layer - a bright dot travels each line, and a few outline triangles drift */
.net-pulse {
  fill: var(--color-depth);
  filter: drop-shadow(0 0 3px var(--color-beacon)) drop-shadow(0 0 7px var(--color-beacon));
  offset-rotate: 0deg;
  animation-name: net-travel;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.net-tri {
  fill: none;
  stroke: var(--color-depth);
  stroke-width: 1.4;
  filter: drop-shadow(0 0 4px var(--color-beacon));
  transform-box: fill-box;
  transform-origin: center;
  animation-name: net-drift;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}

@keyframes net-breathe {
  0%, 100% { opacity: 0.18; transform: scale(1); }
  50%      { opacity: 0.5;  transform: scale(1.35); }
}
@keyframes net-travel {
  0%   { offset-distance: 0%;   opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { offset-distance: 100%; opacity: 0; }
}
@keyframes net-drift {
  0%, 100% { transform: translateY(0) rotate(0deg);    opacity: 0.16; }
  50%      { transform: translateY(-16px) rotate(10deg); opacity: 0.4; }
}

@media (prefers-reduced-motion: reduce) {
  .net-node,
  .net-pulse,
  .net-tri {
    animation: none;
  }
}
</style>
