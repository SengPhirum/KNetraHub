<script setup lang="ts">
const problems = useNetData('server-problems', '/api/server/problems')
const topProblems = computed<any[]>(() => (problems.value || []).filter((p: any) => p.status === 'problem').slice(0, 25))

function duration(p: any) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(p.fired_at)) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
</script>

<template>
  <div v-if="!topProblems.length" class="flex h-full items-center justify-center text-sm text-faint">No open problems. All clear.</div>
  <div v-else class="space-y-2">
    <div v-for="p in topProblems" :key="p.id" class="flex items-center gap-3 rounded-lg border border-surface bg-surface-2 p-2.5">
      <span class="shrink-0 rounded px-2 py-0.5 text-xs font-medium" :class="severityMeta(p.severity_num).badge">{{ severityMeta(p.severity_num).label }}</span>
      <div class="min-w-0 flex-1">
        <NuxtLink :to="`/monitoring/server/hosts/${p.host_id}`" class="block truncate text-sm font-medium text-foam hover:underline">{{ p.name }}</NuxtLink>
        <p class="truncate text-xs text-faint">{{ p.host }}</p>
      </div>
      <span class="shrink-0 text-xs text-faint">{{ duration(p) }}</span>
    </div>
  </div>
</template>
