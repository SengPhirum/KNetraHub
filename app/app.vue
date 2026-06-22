<script setup lang="ts">
const { appearance, htmlStyle, fetchAppearance } = useAppearance()
await fetchAppearance()

useHead({
  title: computed(() => `${appearance.value.appName} - Swarm Console`),
  htmlAttrs: { style: htmlStyle },
  meta: [
    { name: 'theme-color', content: computed(() => appearance.value.primaryColor) },
    { name: 'msapplication-TileColor', content: computed(() => appearance.value.primaryColor) }
  ]
})
</script>

<template>
  <UApp :toaster="{ position: 'bottom-right' }">
    <NuxtPwaManifest />
    <NuxtLayout>
      <NuxtPage :transition="{ name: 'page', mode: 'out-in' }" />
    </NuxtLayout>
  </UApp>
</template>
