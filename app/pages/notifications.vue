<script setup lang="ts">
// Standalone notification history route. The navbar bell now opens this same
// list in a near-full-screen modal (see NotificationBell); this route stays so
// the history is still linkable/bookmarkable. Both render NotificationList, so
// there is exactly one implementation.
</script>

<template>
  <div>
    <PageHeader title="Notifications" subtitle="Alerts from the portal and every app you have access to" icon="i-lucide-bell" />
    <div class="max-w-4xl">
      <NotificationList />
    </div>
  </div>
</template>
