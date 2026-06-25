<script setup lang="ts">
// User preferences moved into a sectioned area (General / Account / Security),
// reached from the preferences sidebar (see useNav). /preferences lands on Info.
definePageMeta({
  middleware: [() => navigateTo('/preferences/info', { replace: true })]
})
</script>

<template>
  <div />
</template>
