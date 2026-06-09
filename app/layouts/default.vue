<script setup lang="ts">
const { user, logout } = useAuth()
const route = useRoute()
const mobileOpen = ref(false)

// close the mobile drawer on navigation
watch(() => route.fullPath, () => { mobileOpen.value = false })

const userMenu = computed(() => [
  [{ label: user.value?.displayName || '', type: 'label' as const }],
  [
    { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
    { label: 'Sign out', icon: 'i-lucide-log-out', onSelect: () => logout() }
  ]
])

const config = useRuntimeConfig()
</script>

<template>
  <div class="min-h-dvh">
    <!-- Desktop sidebar (fixed) -->
    <aside class="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col panel-flush border-y-0 border-l-0 z-30">
      <SidebarNav />
    </aside>

    <!-- Mobile drawer -->
    <USlideover v-model:open="mobileOpen" side="left" :ui="{ content: 'w-[17rem] bg-[var(--color-abyss)] ring-1 ring-[var(--color-hull)]' }">
      <template #content>
        <SidebarNav @navigate="mobileOpen = false" />
      </template>
    </USlideover>

    <!-- Main column -->
    <div class="lg:pl-64 flex min-h-dvh flex-col">
      <!-- top bar -->
      <header class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--color-hull-soft)] bg-[var(--color-ink)]/85 px-4 backdrop-blur-md sm:px-6">
        <UButton
          class="lg:hidden"
          icon="i-lucide-menu"
          color="neutral"
          variant="ghost"
          aria-label="Open navigation"
          @click="mobileOpen = true"
        />

        <div class="flex items-center gap-2 text-sm">
          <span class="dot dot-running" />
          <span class="font-mono text-xs text-[var(--color-muted)]">{{ config.public.appName }}</span>
        </div>

        <div class="flex-1" />

        <UButton
          to="/stacks"
          icon="i-lucide-upload"
          color="primary"
          variant="soft"
          class="hidden sm:inline-flex"
          label="Deploy stack"
        />

        <UDropdownMenu :items="userMenu" :content="{ align: 'end' }">
          <UButton color="neutral" variant="ghost" trailing-icon="i-lucide-chevron-down">
            <span class="flex size-7 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-xs font-semibold ring-1 ring-[var(--color-hull)]">
              {{ (user?.displayName || '?').charAt(0).toUpperCase() }}
            </span>
            <span class="hidden sm:inline text-sm">{{ user?.displayName }}</span>
          </UButton>
        </UDropdownMenu>
      </header>

      <!-- page -->
      <main class="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <slot />
      </main>
    </div>
  </div>
</template>
