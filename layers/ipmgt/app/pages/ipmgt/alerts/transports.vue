<script setup lang="ts">
// IP Management alert transports — where IPAM alerts are delivered. Uses the
// shared AppNotifications panel (central notification library: ipmgt-scoped
// channels plus the Global channels this app opted into). Mirrors the Dock
// app's Alert Transports page. Gated by the IPAM settings tier.
definePageMeta({
  middleware: [
    function () {
      const { hasPermission } = useAuth()
      if (!hasPermission('ipmgt.settings')) return navigateTo('/ipmgt')
    }
  ]
})
</script>

<template>
  <div>
    <PageHeader title="Alert Transports" subtitle="Where IP Management alerts are delivered — this app's channels and shared portal ones" icon="i-lucide-send">
      <template #actions>
        <div class="flex gap-2">
          <UButton size="sm" variant="soft" icon="i-lucide-bell-ring" label="Alert Rules" to="/ipmgt/alerts" />
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-arrow-left" label="Back to IP Mgt" to="/ipmgt" />
        </div>
      </template>
    </PageHeader>

    <div class="max-w-5xl">
      <AppNotifications scope="ipmgt" />
    </div>
  </div>
</template>
