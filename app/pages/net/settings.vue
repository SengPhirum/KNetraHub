<script setup lang="ts">
// Network app administrator settings. Placeholder (Alerts) until the Network
// app's admin features are built - see AppSettingsScaffold. Gated by the net
// admin tier, mirroring the Dock app's own settings page.
definePageMeta({
  middleware: [
    function () {
      const { hasPermission } = useAuth()
      if (!hasPermission('net.manage')) return navigateTo('/net')
    }
  ]
})
</script>

<template>
  <AppSettingsScaffold app-name="Network" app-key="net" back-to="/net" />
</template>
