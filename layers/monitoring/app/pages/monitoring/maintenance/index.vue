<script setup lang="ts">
// Maintenance windows (list). Creation via API; window targets suppress
// alerts (or skip polling entirely) for their devices/groups/locations.
const { hasMonitoring } = useMonitoring()
const { data, status } = useAsyncData('monMaint',
  () => $fetch<any>('/api/monitoring/v1/maintenance'),
  { server: false, default: () => ({ items: [] }) })
</script>

<template>
  <div>
    <PageHeader title="Maintenance" subtitle="Scheduled windows that suppress alerts or polling" icon="i-lucide-wrench" />
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="panel overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
          <tr><th class="px-3 py-2">Title</th><th class="px-3 py-2">Behavior</th><th class="px-3 py-2">Starts</th>
            <th class="px-3 py-2">Ends</th><th class="px-3 py-2">Created by</th></tr>
        </thead>
        <tbody>
          <tr v-if="status === 'pending'"><td colspan="5" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
          <tr v-else-if="!data.items?.length"><td colspan="5" class="px-3 py-8 text-center text-muted">No maintenance windows.</td></tr>
          <tr v-for="m in data.items" :key="m.id" class="border-t border-hull">
            <td class="px-3 py-2">{{ m.title }}</td>
            <td class="px-3 py-2 text-muted">{{ m.behavior }}</td>
            <td class="px-3 py-2 text-xs">{{ new Date(m.starts_at).toLocaleString() }}</td>
            <td class="px-3 py-2 text-xs">{{ new Date(m.ends_at).toLocaleString() }}</td>
            <td class="px-3 py-2 text-muted">{{ m.created_by || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
