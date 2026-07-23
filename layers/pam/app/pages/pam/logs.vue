<script setup lang="ts">
// PAM activity + system logs (reuses the shared module-log page).
definePageMeta({ middleware: [() => !useAuth().hasApp('pam', 'manager') ? navigateTo('/pam') : undefined] })
</script>

<template><ModuleLogPage module="pam" app-name="Privileged Access" back-to="/pam" /></template>
