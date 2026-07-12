<script setup lang="ts">
definePageMeta({ middleware: [() => !useAuth().hasApp('ipmgt', 'operator') ? navigateTo('/ipmgt') : undefined] })
</script>

<template><ModuleLogPage module="ipmgt" app-name="IP Management" back-to="/ipmgt" /></template>
