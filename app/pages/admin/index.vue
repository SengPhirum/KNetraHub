<script setup lang="ts">
// /admin lands on the first admin section (General > Appearance) below. The admin
// sidebar (General / Security / Logs) is provided by the default layout's
// SidebarNav whenever the route isn't inside an app (see useNav).
definePageMeta({
  middleware: ['admin', () => navigateTo('/admin/appearance', { replace: true })]
})
</script>

<template>
  <div />
</template>
