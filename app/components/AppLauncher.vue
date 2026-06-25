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
      >
        <div class="flex items-center gap-3">
          <span
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
</template>
