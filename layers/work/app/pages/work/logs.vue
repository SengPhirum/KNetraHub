<script setup lang="ts">
// Work activity + system logs (reuses the shared module-log page).
definePageMeta({ middleware: [() => !useAuth().hasApp('work', 'manager') ? navigateTo('/work') : undefined] })
</script>

<template><ModuleLogPage module="work" app-name="Work" back-to="/work" /></template>
