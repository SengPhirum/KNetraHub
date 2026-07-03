<script setup lang="ts">
import type { AppKey } from '../../shared/utils/entitlements'

// The KNetraHub app launcher card grid. Lists *every* registered app so the
// portal home is a full directory of what's available. Apps the signed-in user
// can reach (resolved from their Keycloak realm roles + the Settings app-role
// map, or the local-admin superuser) are clickable; apps they can't reach are
// listed but disabled (greyed, non-interactive). Access is always enforced
// again server-side. Rendered on the full-page portal home (/) and on the
// sidebar "Admin" view (/admin).
const { user, hasApp } = useAuth()

const apps = computed(() =>
  getModuleRegistry()
    .filter((m) => m.enabled)
    .map((m) => ({ ...m, accessible: hasApp(m.key as AppKey) }))
)

// "Dive into app" launch effect: a disc grows from the clicked icon until it
// covers the viewport, then we navigate and fade it out over the new page —
// entering an app reads as stepping through it rather than an abrupt swap.
const launching = ref<{ top: number; left: number; size: number; growScale: number; icon: string; closing: boolean } | null>(null)

function launchApp(event: MouseEvent, app: { routePath: string; icon: string; accessible: boolean }) {
  if (!app.accessible) return
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  event.preventDefault()

  const card = event.currentTarget as HTMLElement
  const iconEl = card.querySelector<HTMLElement>('[data-app-icon]') ?? card
  const rect = iconEl.getBoundingClientRect()
  const top = rect.top + rect.height / 2
  const left = rect.left + rect.width / 2
  const size = Math.max(rect.width, rect.height)
  const farX = Math.max(left, window.innerWidth - left)
  const farY = Math.max(top, window.innerHeight - top)
  const growScale = (Math.hypot(farX, farY) * 2) / size

  launching.value = { top, left, size, growScale, icon: app.icon, closing: false }

  setTimeout(async () => {
    await navigateTo(app.routePath)
    await nextTick()
    if (launching.value) launching.value.closing = true
    setTimeout(() => { launching.value = null }, 320)
  }, 420)
}
</script>

<template>
  <div>
    <PageHeader
      title="Apps"
      :subtitle="user ? `Welcome back, ${user.displayName}` : 'Available systems'"
      icon="i-lucide-layout-grid"
    />

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="app in apps"
        :key="app.key"
        :to="app.routePath"
        class="panel group flex flex-col gap-3 p-5 transition"
        :class="app.accessible
          ? 'hover:ring-1 hover:ring-beacon/30'
          : 'pointer-events-none cursor-not-allowed opacity-50 grayscale'"
        :tabindex="app.accessible ? undefined : -1"
        :aria-disabled="app.accessible ? undefined : 'true'"
        @click="launchApp($event, app)"
      >
        <div class="flex items-center gap-3">
          <span
            data-app-icon
            class="flex size-11 items-center justify-center rounded-xl ring-1"
            :class="app.accessible ? 'bg-beacon/12 ring-beacon/25' : 'bg-surface-2 ring-hull'"
          >
            <UIcon :name="app.icon" class="size-6" :class="app.accessible ? 'text-beacon' : 'text-faint'" />
          </span>
          <div class="min-w-0">
            <p class="font-display text-base font-semibold text-foam">{{ app.name }}</p>
            <p class="text-[11px] uppercase tracking-wider text-faint">
              {{ app.type === 'local' ? 'Built in' : 'Subsystem' }}
            </p>
          </div>
          <UBadge
            v-if="!app.accessible"
            color="neutral"
            variant="subtle"
            size="sm"
            icon="i-lucide-lock"
            label="No access"
            class="ml-auto"
          />
          <UIcon
            v-else
            name="i-lucide-arrow-up-right"
            class="ml-auto size-4 text-faint opacity-0 transition group-hover:opacity-100"
          />
        </div>
        <p class="text-sm text-(--color-muted)">{{ app.description }}</p>
      </NuxtLink>
    </div>

    <Teleport to="body">
      <div v-if="launching" class="app-launch-overlay">
        <div
          class="app-launch-disc"
          :class="{ 'is-closing': launching.closing }"
          :style="{
            top: `${launching.top}px`,
            left: `${launching.left}px`,
            width: `${launching.size}px`,
            height: `${launching.size}px`,
            '--grow-scale': launching.growScale
          }"
        >
          <UIcon :name="launching.icon" class="app-launch-icon" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.app-launch-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  overflow: hidden;
}
.app-launch-disc {
  position: fixed;
  transform: translate(-50%, -50%) scale(1);
  border-radius: 9999px;
  background: var(--color-beacon);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: app-launch-grow 0.42s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  transition: opacity 0.32s ease;
}
.app-launch-disc.is-closing {
  opacity: 0;
}
.app-launch-icon {
  color: white;
  width: 40%;
  height: 40%;
  animation: app-launch-icon-fade 0.42s ease forwards;
}
@keyframes app-launch-grow {
  from { transform: translate(-50%, -50%) scale(1); }
  to { transform: translate(-50%, -50%) scale(var(--grow-scale, 40)); }
}
@keyframes app-launch-icon-fade {
  0% { opacity: 1; transform: scale(1); }
  45% { opacity: 1; transform: scale(1.15); }
  100% { opacity: 0; transform: scale(1.6); }
}
</style>
