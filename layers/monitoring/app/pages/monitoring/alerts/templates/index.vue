<script setup lang="ts">
// Alert templates: safe {{ path }} interpolation only — no code execution.
const { hasMonitoring } = useMonitoring()
const { data, status } = useAsyncData('monTemplates',
  () => $fetch<any>('/api/monitoring/v1/alerts/templates'),
  { server: false, default: () => ({ items: [] }) })
</script>

<template>
  <div>
    <PageHeader title="Alert Templates" subtitle="Notification rendering (safe interpolation)" icon="i-lucide-layout-template" />
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="space-y-4">
      <div v-if="status === 'pending'" class="panel p-8 text-center text-muted">Loading…</div>
      <div v-for="t in data.items" :key="t.id" class="panel p-4">
        <div class="mb-2 flex items-center gap-2">
          <h3 class="font-semibold">{{ t.name }}</h3>
          <span v-if="t.is_default" class="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">default</span>
        </div>
        <div class="mb-1 text-xs uppercase text-faint">Title</div>
        <pre class="mb-3 overflow-x-auto rounded bg-surface-2 p-2 text-xs">{{ t.title_template }}</pre>
        <div class="mb-1 text-xs uppercase text-faint">Body</div>
        <pre class="overflow-x-auto rounded bg-surface-2 p-2 text-xs">{{ t.body_template }}</pre>
      </div>
    </div>
  </div>
</template>
