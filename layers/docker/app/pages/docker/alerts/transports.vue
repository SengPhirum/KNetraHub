<script setup lang="ts">
// Docker alert transports — where Swarm alerts are delivered. Uses the shared
// AppNotifications panel (central notification library: Docker-scoped channels
// plus the Global channels this app has opted into). Named "Alert Transports"
// to match the Monitoring module's Alerts menu. Gated by the per-app docker
// admin tier — the same boundary /api/notifications/* enforces.
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
    <PageHeader title="Alert Transports" subtitle="Where Dock alerts are delivered — this app's channels and shared portal ones" icon="i-lucide-send">
      <template #actions>
        <div class="flex gap-2">
          <UButton size="sm" variant="soft" icon="i-lucide-bell-ring" label="Alert Rules" to="/docker/alerts" />
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-arrow-left" label="Back to Dock" to="/docker" />
        </div>
      </template>
    </PageHeader>

    <div class="max-w-5xl">
      <AppNotifications scope="docker" />
    </div>
  </div>
</template>
