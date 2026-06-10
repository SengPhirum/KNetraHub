<script setup lang="ts">
const props = defineProps<{ state?: string | null }>()
const map: Record<string, { dot: string; label: string; cls: string }> = {
  ready:    { dot: 'dot-running', label: 'Ready',    cls: 'status-running' },
  running:  { dot: 'dot-running', label: 'Running',  cls: 'status-running' },
  active:   { dot: 'dot-running', label: 'Active',   cls: 'status-running' },
  complete: { dot: 'dot-running', label: 'Complete', cls: 'status-running' },
  pending:  { dot: 'dot-pending', label: 'Pending',  cls: 'status-pending' },
  starting: { dot: 'dot-pending', label: 'Starting', cls: 'status-pending' },
  preparing:{ dot: 'dot-pending', label: 'Preparing',cls: 'status-pending' },
  new:      { dot: 'dot-pending', label: 'New',      cls: 'status-pending' },
  updating: { dot: 'dot-pending', label: 'Updating', cls: 'status-pending' },
  paused:   { dot: 'dot-idle',    label: 'Paused',   cls: 'status-idle' },
  drain:    { dot: 'dot-idle',    label: 'Drained',  cls: 'status-idle' },
  down:     { dot: 'dot-down',    label: 'Down',     cls: 'status-down' },
  failed:   { dot: 'dot-down',    label: 'Failed',   cls: 'status-down' },
  rejected: { dot: 'dot-down',    label: 'Rejected', cls: 'status-down' },
  shutdown: { dot: 'dot-idle',    label: 'Shutdown', cls: 'status-idle' }
}
const s = computed(() => map[(props.state || '').toLowerCase()] || { dot: 'dot-idle', label: props.state || 'Unknown', cls: 'status-idle' })
</script>
<template>
  <span class="inline-flex items-center gap-2 text-xs font-medium" :class="s.cls">
    <span class="dot" :class="s.dot" />
    {{ s.label }}
  </span>
</template>
