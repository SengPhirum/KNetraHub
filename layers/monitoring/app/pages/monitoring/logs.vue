<script setup lang="ts">
definePageMeta({ middleware: [() => !useAuth().hasApp('monitoring', 'operator') ? navigateTo('/monitoring') : undefined] })
</script>

<template><ModuleLogPage module="monitoring" app-name="Monitoring" back-to="/monitoring" /></template>
