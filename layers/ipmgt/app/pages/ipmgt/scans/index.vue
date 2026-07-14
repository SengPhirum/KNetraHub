<script setup lang="ts">
// Global scan history across all subnets (host-status refresh + discovery).
const { hasApp } = useAuth()
const { data: scans, status, error, refresh } = useAsyncData('ipamScansAll', () => $fetch<any[]>('/api/ipmgt/scans', { query: { limit: 200 } }), { server: false, default: () => [] })
</script>

<template>
  <div>
    <PageHeader title="Scan History" subtitle="Host-status and discovery scan runs across all subnets" icon="i-lucide-radar">
      <template v-if="hasApp('ipmgt')" #actions>
        <UButton icon="i-lucide-refresh-cw" size="sm" variant="soft" @click="refresh">Refresh</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <DataState v-else :status="status" :error="error" :empty="!scans.length" empty-label="No scans have run yet." empty-icon="i-lucide-radar">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-2 text-xs uppercase text-faint">
            <tr>
              <th class="px-4 py-3 font-medium">Subnet</th>
              <th class="px-4 py-3 font-medium">Started</th>
              <th class="px-4 py-3 font-medium">Trigger</th>
              <th class="px-4 py-3 font-medium">By</th>
              <th class="px-4 py-3 font-medium">Scanned</th>
              <th class="px-4 py-3 font-medium">Up</th>
              <th class="px-4 py-3 font-medium">New hosts</th>
              <th class="px-4 py-3 font-medium">Result</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="h in scans" :key="h.id" class="hover:bg-surface-2/40">
              <td class="px-4 py-3">
                <NuxtLink v-if="h.subnet_id" :to="`/ipmgt/subnets/${h.subnet_id}`" class="font-mono text-foam hover:text-beacon">{{ h.subnet_network }}</NuxtLink>
                <span v-else class="text-faint">—</span>
              </td>
              <td class="px-4 py-3 text-xs text-faint">{{ (h.started_at || '').slice(0, 16).replace('T', ' ') }}</td>
              <td class="px-4 py-3 text-(--color-muted) capitalize">{{ h.trigger }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ h.actor || 'scheduler' }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ h.hosts_scanned }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ h.hosts_up }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ h.new_hosts }}</td>
              <td class="px-4 py-3">
                <span v-if="h.error" class="text-xs text-rose-400" :title="h.error">Failed</span>
                <span v-else-if="!h.finished_at" class="text-xs text-amber-400">Running…</span>
                <span v-else class="text-xs text-emerald-400">OK</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>
  </div>
</template>
