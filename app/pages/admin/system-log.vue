<script setup lang="ts">
// Admin > Logs > System Log. Placeholder until portal-level system logging is
// implemented (app/server runtime events, distinct from the Audit log of
// state-changing user actions). Listed in the Logs section alongside Audit log.
definePageMeta({ middleware: 'admin' })
</script>

<template>
  <div>
    <PageHeader title="System log" subtitle="Portal runtime and diagnostic events" icon="i-lucide-file-text" />

    <section class="panel flex flex-col items-center gap-3 p-10 text-center">
      <UIcon name="i-lucide-file-clock" class="size-7 text-faint" />
      <div>
        <h3 class="font-display text-sm font-semibold text-foam">System log not available yet</h3>
        <p class="mt-1 max-w-md text-xs text-(--color-muted)">
          Portal-level runtime and diagnostic logging will appear here once it's
          implemented. For state-changing user actions, see the Audit log.
        </p>
      </div>
      <UButton color="neutral" variant="soft" size="sm" icon="i-lucide-scroll-text" label="Open Audit log" to="/audit" />
    </section>
  </div>
</template>
