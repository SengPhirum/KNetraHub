<script setup lang="ts">
import type { AppKey } from '../../shared/utils/entitlements'

// The portal directory only shows subsystems explicitly enabled by an admin.
// A clean installation therefore opens on a welcome state instead of exposing
// module cards backed by databases that have not been provisioned yet.
const { user, hasApp, can } = useAuth()
const { modules, enabledModules, fetchModules } = useModules()
const { prefs, updatePreferences } = usePreferences()
const toast = useToast()
const setupOpen = ref(false)

await fetchModules().catch(() => [])

// Cards can be dragged into a personal order, persisted per user in
// prefs.appOrder (module keys). Modules missing from the saved order — e.g.
// enabled after the user last rearranged — keep their catalog order after the
// arranged ones. During a drag, dragOrder overrides the saved order so cards
// re-flow live under the cursor.
const draggingKey = ref<string | null>(null)
const dragOrder = ref<string[] | null>(null)
let dragStartOrder = ''

const apps = computed(() => {
  const base = enabledModules.value
    .map((m) => ({ ...m, accessible: hasApp(m.key as AppKey) }))
  const order = dragOrder.value ?? prefs.value.appOrder
  if (!order?.length) return base
  const pos = new Map(order.map((key, index) => [key, index]))
  return base
    .map((app, index) => ({ app, rank: pos.get(app.key) ?? order.length + index }))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.app)
})

function onDragStart(event: DragEvent, key: string) {
  draggingKey.value = key
  dragOrder.value = apps.value.map((a) => a.key)
  dragStartOrder = JSON.stringify(dragOrder.value)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', key)
  }
}

// Reorder on dragenter (fires once per card entered) rather than dragover,
// so cards don't thrash while the pointer sits still over one of them.
function onDragEnter(overKey: string) {
  const dragging = draggingKey.value
  const order = dragOrder.value
  if (!dragging || !order || overKey === dragging) return
  const from = order.indexOf(dragging)
  const to = order.indexOf(overKey)
  if (from === -1 || to === -1 || from === to) return
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, dragging)
  dragOrder.value = next
}

async function onDragEnd() {
  draggingKey.value = null
  const next = dragOrder.value
  if (!next) return
  if (JSON.stringify(next) === dragStartOrder) {
    dragOrder.value = null
    return
  }
  try {
    await updatePreferences({ appOrder: next })
    dragOrder.value = null
  } catch {
    // Keep the local arrangement for this visit even though it didn't persist.
    toast.add({ title: 'Could not save app order', description: 'Your arrangement will reset on the next visit.', color: 'error' })
  }
}

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
    >
      <template v-if="can('admin') && apps.length" #actions>
        <UButton variant="soft" icon="i-lucide-settings-2" to="/admin/modules">Manage modules</UButton>
      </template>
    </PageHeader>

    <div v-if="!apps.length" class="panel relative overflow-hidden px-6 py-14 text-center sm:px-12">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_srgb,var(--color-beacon)_14%,transparent),transparent_55%)]" />
      <div class="relative mx-auto max-w-xl">
        <span class="mx-auto flex size-16 items-center justify-center rounded-2xl bg-beacon/10 ring-1 ring-beacon/25">
          <UIcon name="i-lucide-blocks" class="size-8 text-beacon" />
        </span>
        <h2 class="mt-5 font-display text-2xl font-semibold text-foam">Welcome to KNetraHub</h2>
        <p class="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
          This portal is ready, with no subsystems enabled yet. Choose only the built-in systems your organization needs; each one will receive its own isolated database.
        </p>
        <UButton
          v-if="can('admin')"
          class="mt-6"
          size="lg"
          icon="i-lucide-wand-sparkles"
          @click="setupOpen = true"
        >
          Initialize modules
        </UButton>
        <p v-else class="mt-5 text-xs text-faint">Ask a portal administrator to initialize the required modules.</p>
      </div>
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" @drop.prevent>
      <!-- The wrapper (not the link) owns drag-and-drop: the anchor's native
           link-drag is disabled so the whole card drags, and locked cards -
           whose link is pointer-events-none - still work as drop targets. -->
      <div
        v-for="app in apps"
        :key="app.key"
        :draggable="apps.length > 1"
        class="transition duration-150"
        :class="draggingKey === app.key ? 'scale-[0.98] opacity-40' : ''"
        @dragstart="onDragStart($event, app.key)"
        @dragenter="onDragEnter(app.key)"
        @dragover.prevent
        @drop.prevent
        @dragend="onDragEnd"
      >
        <NuxtLink
          :to="app.routePath"
          draggable="false"
          class="panel group flex h-full flex-col gap-3 p-5 transition"
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
    </div>

    <p v-if="apps.length > 1" class="mt-4 flex items-center gap-1.5 text-xs text-faint">
      <UIcon name="i-lucide-move" class="size-3.5" />
      Drag cards to arrange them - the order is saved to your profile.
    </p>

    <ModuleSetupWizard v-model:open="setupOpen" :modules="modules" />

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
