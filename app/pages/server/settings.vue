<script setup lang="ts">
// Server app administrator settings. Placeholder (Alerts) until the Server
// app's admin features are built - see AppSettingsScaffold. Gated by the server
// admin tier, mirroring the Dock app's own settings page.
definePageMeta({
  middleware: [
    function () {
      const { hasPermission } = useAuth()
      if (!hasPermission('server.manage')) return navigateTo('/server')
    }
  ]
})
</script>

<template>
  <AppSettingsScaffold app-name="Server" app-key="server" back-to="/server" />
</template>
