<script setup lang="ts">
const props = defineProps<{ state?: string | null }>()
const map: Record<string, { dot: string; label: string; cls: string }> = {
  ready:    { dot: 'dot-running', label: 'Ready',    cls: 'text-emerald-300' },
  running:  { dot: 'dot-running', label: 'Running',  cls: 'text-emerald-300' },
  active:   { dot: 'dot-running', label: 'Active',   cls: 'text-emerald-300' },
  complete: { dot: 'dot-running', label: 'Complete', cls: 'text-emerald-300' },
  pending:  { dot: 'dot-pending', label: 'Pending',  cls: 'text-amber-300' },
  starting: { dot: 'dot-pending', label: 'Starting', cls: 'text-amber-300' },
  preparing:{ dot: 'dot-pending', label: 'Preparing',cls: 'text-amber-300' },
  new:      { dot: 'dot-pending', label: 'New',      cls: 'text-amber-300' },
  updating: { dot: 'dot-pending', label: 'Updating', cls: 'text-amber-300' },
  paused:   { dot: 'dot-idle',    label: 'Paused',   cls: 'text-slate-300' },
  drain:    { dot: 'dot-idle',    label: 'Drained',  cls: 'text-slate-300' },
  down:     { dot: 'dot-down',    label: 'Down',     cls: 'text-rose-300' },
  failed:   { dot: 'dot-down',    label: 'Failed',   cls: 'text-rose-300' },
  rejected: { dot: 'dot-down',    label: 'Rejected', cls: 'text-rose-300' },
  shutdown: { dot: 'dot-idle',    label: 'Shutdown', cls: 'text-slate-300' }
}
const s = computed(() => map[(props.state || '').toLowerCase()] || { dot: 'dot-idle', label: props.state || 'Unknown', cls: 'text-slate-300' })
</script>
<template>
  <span class="inline-flex items-center gap-2 text-xs font-medium" :class="s.cls">
    <span class="dot" :class="s.dot" />
    {{ s.label }}
  </span>
</template>
