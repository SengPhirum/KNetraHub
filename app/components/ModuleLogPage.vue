<script setup lang="ts">
const props = defineProps<{
  module: 'docker' | 'monitoring' | 'ipmgt'
  appName: string
  backTo: string
}>()
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      title="Logs"
      :subtitle="`${appName} audit activity and runtime events`"
      icon="i-lucide-scroll-text"
    >
      <template #actions>
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="soft" :label="`Back to ${appName}`" :to="backTo" />
      </template>
    </PageHeader>

    <section class="panel max-w-6xl p-5">
      <ModuleLogs :module="module" />
    </section>
  </div>
</template>
