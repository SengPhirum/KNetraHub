<script setup lang="ts">
// The customizable dashboard canvas that used to live here moved to /monitoring
// (it's now the single Overview for the whole Monitoring app, with widget types
// for both Network and Server) - this stub keeps old bookmarks/links working.
definePageMeta({
  middleware: [() => navigateTo('/monitoring', { replace: true })]
})
</script>

<template>
  <div />
</template>
