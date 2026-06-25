<script setup lang="ts">
// IP Management app administrator settings. Placeholder (Alerts) until the
// IP Management app's admin features are built - see AppSettingsScaffold. Gated
// by the ipmgt admin tier, mirroring the Dock app's own settings page.
definePageMeta({
  middleware: [
    function () {
      const { hasPermission } = useAuth()
      if (!hasPermission('ipmgt.delete')) return navigateTo('/ipmgt')
    }
  ]
})
</script>

<template>
  <AppSettingsScaffold app-name="IP Management" app-key="ipmgt" back-to="/ipmgt" />
</template>
