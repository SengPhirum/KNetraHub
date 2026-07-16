<script setup lang="ts">
// Alert rules list (read view). Rule creation/editing uses the API directly;
// this page shows the configured rules, their scope, and active alert counts.
const { hasMonitoring } = useMonitoring()
const { data, status } = useAsyncData('monRules',
  () => $fetch<any>('/api/monitoring/v1/alerts/rules'),
  { server: false, default: () => ({ items: [] }) })
</script>

<template>
  <div>
    <PageHeader title="Alert Rules" subtitle="Structured rule conditions drive incidents" icon="i-lucide-bell-ring">
      <template #actions><NuxtLink to="/monitoring/alerts"><UButton size="sm" variant="soft" icon="i-lucide-triangle-alert">Active alerts</UButton></NuxtLink></template>
    </PageHeader>
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="panel overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
          <tr><th class="px-3 py-2">Rule</th><th class="px-3 py-2">Entity</th><th class="px-3 py-2">Severity</th>
            <th class="px-3 py-2">Enabled</th><th class="px-3 py-2 text-right">Delay</th><th class="px-3 py-2 text-right">Active</th></tr>
        </thead>
        <tbody>
          <tr v-if="status === 'pending'"><td colspan="6" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
          <tr v-for="r in data.items" :key="r.id" class="border-t border-hull">
            <td class="px-3 py-2">{{ r.name }}<div v-if="r.note" class="text-xs text-faint">{{ r.note }}</div></td>
            <td class="px-3 py-2 text-muted">{{ r.entity_type }}</td>
            <td class="px-3 py-2"><span :class="r.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'">{{ r.severity }}</span></td>
            <td class="px-3 py-2">{{ r.enabled ? 'Yes' : 'No' }}</td>
            <td class="px-3 py-2 text-right text-muted">{{ r.delay_seconds }}s</td>
            <td class="px-3 py-2 text-right">
              <span v-if="r.active_alerts > 0" class="rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-400">{{ r.active_alerts }}</span>
              <span v-else class="text-faint">0</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
