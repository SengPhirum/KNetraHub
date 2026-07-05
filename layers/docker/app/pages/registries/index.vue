<script setup lang="ts">
// The Registries admin page moved into a tab on Docker Settings (it's admin
// configuration, not a nav destination) - this stub keeps old bookmarks/links
// working by forwarding to the new location.
definePageMeta({
  middleware: [() => navigateTo('/docker/settings', { replace: true })]
})
</script>

<template>
  <div />
</template>
