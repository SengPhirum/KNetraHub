<script setup lang="ts">
// The fixed Server Dashboard moved into the unified /monitoring canvas as
// widgets (Host Status Summary, Problems by Severity, Top Problems) - this stub
// keeps old bookmarks/links working.
definePageMeta({
  middleware: [() => navigateTo('/monitoring', { replace: true })]
})
</script>

<template>
  <div />
</template>
