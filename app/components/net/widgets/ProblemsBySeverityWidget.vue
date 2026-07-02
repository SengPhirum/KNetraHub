<script setup lang="ts">
const problems = useNetData('server-problems', '/api/server/problems')
const openProblems = computed<any[]>(() => (problems.value || []).filter((p: any) => p.status === 'problem'))
const bySeverity = computed(() => {
  const counts = new Map<number, number>()
  for (const p of openProblems.value) counts.set(Number(p.severity_num), (counts.get(Number(p.severity_num)) || 0) + 1)
  return SEVERITIES.slice().reverse().map((s) => ({ ...s, count: counts.get(s.value) || 0 }))
})
</script>

<template>
  <div v-if="!openProblems.length" class="flex h-full items-center justify-center text-sm text-faint">No open problems.</div>
  <div v-else class="space-y-2">
    <div v-for="s in bySeverity" :key="s.value" class="flex items-center gap-3">
      <span class="w-28 truncate text-xs" :class="s.text">{{ s.label }}</span>
      <div class="h-2 flex-1 overflow-hidden rounded bg-surface-2">
        <div class="h-full rounded" :style="{ width: (openProblems.length ? (s.count / openProblems.length * 100) : 0) + '%', backgroundColor: s.hex }" />
      </div>
      <span class="w-8 text-right font-display font-semibold text-foam">{{ s.count }}</span>
    </div>
  </div>
</template>
