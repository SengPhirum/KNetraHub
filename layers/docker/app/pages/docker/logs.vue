<script setup lang="ts">
definePageMeta({ middleware: [() => !useAuth().hasApp('docker', 'operator') ? navigateTo('/docker') : undefined] })
</script>

<template><ModuleLogPage module="docker" app-name="Dock" back-to="/docker" /></template>
