<script setup lang="ts">
// Connector catalog — built-in + custom connectors and their capabilities.
const { data, status, error } = useAsyncData('pamConnectors',
  () => $fetch<any[]>('/api/pam/v1/connectors'), { server: false, default: () => [] })
function caps(c: any) { return Object.entries(c.capabilities || {}).filter(([, v]) => v).map(([k]) => k) }
</script>

<template>
  <div>
    <PageHeader title="Connectors" subtitle="Credential/target connectors and their capabilities" icon="i-lucide-plug" />
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No connectors.">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Connector</th><th class="px-3 py-2">Base type</th><th class="px-3 py-2">Execution</th><th class="px-3 py-2">Capabilities</th><th class="px-3 py-2">Version</th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="c in data" :key="c.key" class="hover:bg-surface-2/40">
              <td class="px-3 py-2 font-medium text-foam">{{ c.label }} <span class="font-mono text-xs text-faint">{{ c.key }}</span></td>
              <td class="px-3 py-2 font-mono text-xs text-(--color-muted)">{{ c.baseType }}</td>
              <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="c.runsInProcess ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'">{{ c.runsInProcess ? 'in-process' : 'runner' }}</span></td>
              <td class="px-3 py-2 text-xs text-(--color-muted)">{{ caps(c).join(', ') }}</td>
              <td class="px-3 py-2 text-xs text-faint">{{ c.version }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>
  </div>
</template>
