<script setup lang="ts">
import type { AppKey, AppTier } from '../../../shared/utils/entitlements'

// Preferences > General > Info. Default landing for the preferences area:
// a read-only summary of who the signed-in user is and what they can reach.
const { user, accessibleApps } = useAuth()

const TIER_COLOR: Record<AppTier, 'neutral' | 'info' | 'primary'> = {
  viewer: 'neutral',
  operator: 'info',
  admin: 'primary'
}

const appAccess = computed(() =>
  getModuleRegistry()
    .filter((m) => m.enabled)
    .map((m) => ({ ...m, tier: (user.value?.apps?.[m.key as AppKey] ?? null) as AppTier | null }))
)
</script>

<template>
  <div>
    <PageHeader title="Info" subtitle="A summary of your account and access" icon="i-lucide-circle-user" />

    <div class="grid gap-4 xl:grid-cols-2 max-w-5xl">
      <!-- Identity -->
      <section class="panel p-5 space-y-5">
        <div class="flex items-center gap-4">
          <span class="flex size-14 items-center justify-center rounded-full bg-surface-2 text-xl font-semibold text-foam ring-2 ring-hull">
            {{ (user?.displayName || user?.username || '?').charAt(0).toUpperCase() }}
          </span>
          <div class="min-w-0">
            <p class="font-display text-base font-semibold text-foam">{{ user?.displayName || user?.username || '—' }}</p>
            <p class="font-mono text-xs text-faint">{{ user?.username || '—' }}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-lg bg-surface-2 px-3 py-2">
            <p class="text-xs text-faint mb-0.5">Global role</p>
            <p class="font-medium capitalize text-foam">{{ user?.role || '—' }}</p>
          </div>
          <div class="rounded-lg bg-surface-2 px-3 py-2">
            <p class="text-xs text-faint mb-0.5">Auth source</p>
            <p class="font-medium uppercase text-foam">{{ user?.source || '—' }}</p>
          </div>
        </div>

        <div v-if="user?.realmRoles?.length">
          <p class="text-xs font-semibold uppercase tracking-widest text-faint mb-2">Identity-provider roles</p>
          <div class="flex flex-wrap gap-1.5">
            <UBadge v-for="r in user.realmRoles" :key="r" color="neutral" variant="subtle" size="sm" :label="r" class="font-mono" />
          </div>
        </div>

        <div class="flex flex-wrap gap-2 border-t border-hull pt-4">
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-paintbrush" label="Appearance" to="/preferences/appearance" />
          <UButton v-if="user?.source === 'local'" size="sm" color="neutral" variant="soft" icon="i-lucide-key-round" label="Change password" to="/preferences/password" />
        </div>
      </section>

      <!-- App access -->
      <section class="panel p-5">
        <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2 mb-1">
          <UIcon name="i-lucide-layout-grid" class="size-4 text-beacon" />
          App access
        </h3>
        <p class="text-xs text-(--color-muted) mb-4">
          Your tier per app. {{ accessibleApps.length }} of {{ appAccess.length }} apps available to you.
        </p>
        <div class="divide-y divide-hull">
          <div v-for="app in appAccess" :key="app.key" class="flex items-center gap-3 py-2.5">
            <UIcon :name="app.icon" class="size-4 shrink-0" :class="app.tier ? 'text-beacon' : 'text-faint'" />
            <p class="text-sm" :class="app.tier ? 'text-foam' : 'text-faint'">{{ app.name }}</p>
            <UBadge
              v-if="app.tier"
              :color="TIER_COLOR[app.tier]"
              variant="subtle"
              size="sm"
              class="ml-auto capitalize"
              :label="app.tier"
            />
            <UBadge v-else color="neutral" variant="subtle" size="sm" icon="i-lucide-lock" label="No access" class="ml-auto" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
