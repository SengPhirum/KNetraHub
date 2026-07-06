<script setup lang="ts">
// The hero panel doubles as a quick orientation to what KNetraHub actually is -
// a portal over several independent ops subsystems - rather than just branding.
// Keep this in sync with app/utils/moduleRegistry.ts if a module's pitch changes.
const heroFeatures = [
  { icon: 'i-lucide-container', label: 'Docker', description: 'Nodes, services, stacks, and data resources' },
  { icon: 'i-lucide-activity', label: 'Monitoring', description: 'Unified network + server health, alerts, and problems' },
  { icon: 'i-lucide-id-card', label: 'IP Management', description: 'Subnets, address inventory, and utilization' }
]
</script>

<template>
  <div class="relative min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <div class="absolute right-4 top-4 z-20">
      <ThemeModeControl compact />
    </div>

    <!-- Hero / brand panel - the "what is this and why should I trust it" side. Hidden below lg; the form panel carries its own compact brand mark there. -->
    <aside class="relative hidden overflow-hidden border-r border-hull lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
      <div
        class="pointer-events-none absolute inset-0 -z-10"
        style="background-color: var(--color-abyss); background-image: radial-gradient(900px 480px at 8% -10%, var(--page-glow-1), transparent 60%), radial-gradient(700px 420px at 105% 110%, var(--page-glow-2), transparent 55%);"
      />
      <UIcon name="i-lucide-network" class="pointer-events-none absolute -bottom-20 -right-20 size-104 text-beacon opacity-[0.05]" />

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
