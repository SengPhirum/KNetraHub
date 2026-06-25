<script setup lang="ts">
// The portal settings moved into the admin area (Admin > General/Security).
// Kept as a redirect so old links/bookmarks to /settings still resolve.
definePageMeta({
  middleware: ['admin', () => navigateTo('/admin/appearance', { replace: true })]
})
</script>

<template>
  <div />
</template>
