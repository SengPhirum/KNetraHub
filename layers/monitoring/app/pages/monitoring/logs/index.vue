<script setup lang="ts">
// Logs hub: links to each log stream.
const links = [
  ['Event Log', '/monitoring/logs/events', 'i-lucide-list', 'Device/port/sensor state changes'],
  ['Syslog', '/monitoring/logs/syslog', 'i-lucide-scroll-text', 'RFC 3164/5424 messages'],
  ['SNMP Traps', '/monitoring/logs/traps', 'i-lucide-radio', 'Received traps + handler results'],
  ['Alert Log', '/monitoring/logs/alerts', 'i-lucide-bell', 'Alert state transitions']
]
</script>

<template>
  <div>
    <PageHeader title="Logs" subtitle="Event, syslog, trap, and alert streams" icon="i-lucide-file-terminal" />
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <NuxtLink v-for="l in links" :key="l[1]" :to="l[1]" class="panel p-4 hover:ring-1 hover:ring-primary/40">
        <UIcon :name="l[2]" class="mb-2 h-5 w-5 text-primary" />
        <h3 class="font-semibold">{{ l[0] }}</h3>
        <p class="text-sm text-muted">{{ l[3] }}</p>
      </NuxtLink>
    </div>
  </div>
</template>
