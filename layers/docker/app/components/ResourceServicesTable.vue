<script setup lang="ts">
const props = withDefaults(defineProps<{
  services?: any[]
  title?: string
  emptyLabel?: string
}>(), {
  title: 'Services',
  emptyLabel: 'No services attached.'
})

const rows = computed(() => props.services || [])

function replicaLabel(service: any) {
  return service.replicas == null ? `${service.running ?? 0}/global` : `${service.running ?? 0}/${service.replicas ?? service.desired ?? 0}`
}

function portsLabel(ports: any[] = []) {
  if (!ports.length) return '-'
  return ports.map((p) => {
    const proto = p.protocol && p.protocol !== 'tcp' ? `/${p.protocol}` : ''
    return p.published ? `${p.published}:${p.target}${proto}` : `${p.target}${proto}`
  }).join(', ')
}
</script>

<template>
  <section class="panel p-0 overflow-hidden">
    <div class="flex items-center justify-between gap-2 px-4 py-4">
      <h2 class="font-display text-lg font-semibold text-foam">{{ title }}</h2>
      <span class="text-xs text-faint">{{ rows.length }} total</span>
    </div>
    <div class="overflow-x-auto">
      <table class="min-w-full text-left text-sm">
        <thead class="border-y border-hull text-xs uppercase tracking-wide text-faint">
          <tr>
            <th class="px-4 py-3 font-medium">Service</th>
            <th class="px-4 py-3 font-medium">Replicas</th>
            <th class="px-4 py-3 font-medium">Ports</th>
            <th class="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-hull">
          <tr v-if="!rows.length">
            <td colspan="4" class="px-4 py-8 text-center text-(--color-muted)">{{ emptyLabel }}</td>
          </tr>
          <tr v-for="service in rows" :key="service.id" class="align-top transition hover:bg-surface-2/60">
            <td class="px-4 py-3">
              <NuxtLink :to="`/services/${service.id}`" class="font-medium text-foam hover:text-beacon">
                {{ service.name || '-' }}
              </NuxtLink>
              <p class="mt-0.5 max-w-[28rem] truncate font-mono text-xs text-faint">{{ service.image || '-' }}</p>
            </td>
            <td class="px-4 py-3 font-mono text-sm text-foam">{{ replicaLabel(service) }}</td>
            <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">{{ portsLabel(service.ports) }}</td>
            <td class="px-4 py-3"><StatusBadge :state="service.status" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
