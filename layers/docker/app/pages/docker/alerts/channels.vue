<script setup lang="ts">
// Docker alert delivery channels — where Swarm alerts are sent. Uses the shared
// AppNotifications panel (central notification library: Docker-scoped channels
// plus the Global channels this app has opted into). Split out of Dock settings
// into its own "Alerts" section, alongside the Rules page. Gated by the per-app
// docker admin tier — the same boundary /api/notifications/* enforces.
definePageMeta({
  middleware: [
    function () {
      const { hasPermission } = useAuth()
      if (!hasPermission('docker.manage')) return navigateTo('/docker')
    }
  ]
})
</script>

<template>
  <div>
    <PageHeader title="Alert channels" subtitle="Where Dock alerts are delivered — this app's channels and shared portal ones" icon="i-lucide-satellite-dish">
      <template #actions>
        <div class="flex gap-2">
          <UButton size="sm" variant="soft" icon="i-lucide-bell-ring" label="Rules" to="/docker/alerts" />
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-arrow-left" label="Back to Dock" to="/docker" />
        </div>
      </template>
    </PageHeader>

    <div class="max-w-5xl">
      <AppNotifications scope="docker" />
    </div>
  </div>
</template>
