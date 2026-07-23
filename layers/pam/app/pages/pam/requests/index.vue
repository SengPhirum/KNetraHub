<script setup lang="ts">
// Access requests — the caller's own (viewers) or all (approvers).
const { shortTime } = usePam()
const mine = ref(false)
const { data, status, error } = useAsyncData('pamRequests',
  () => $fetch<any[]>('/api/pam/v1/requests', { params: mine.value ? { mine: 'true' } : {} }),
  { server: false, default: () => [], watch: [mine] })

const statusBadge: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30',
  approved: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30',
  rejected: 'bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/30',
  cancelled: 'text-faint ring-1 ring-inset ring-hull',
  expired: 'text-faint ring-1 ring-inset ring-hull',
  revoked: 'bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/30'
}
</script>

<template>
  <div>
    <PageHeader title="Access requests" subtitle="Privileged-access requests and their state" icon="i-lucide-ticket">
      <template #actions>
        <UButton to="/pam/requests/new" icon="i-lucide-plus" size="sm">New request</UButton>
      </template>
    </PageHeader>
    <div class="mb-3"><UCheckbox v-model="mine" label="Only my requests" /></div>
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No requests.">
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs uppercase text-faint"><tr><th class="px-3 py-2">Requester</th><th class="px-3 py-2">Action</th><th class="px-3 py-2">Accounts</th><th class="px-3 py-2">Reason</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">When</th></tr></thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="r in data" :key="r.id" class="cursor-pointer hover:bg-surface-2/40" @click="navigateTo(`/pam/requests/${r.id}`)">
              <td class="px-3 py-2 text-foam">{{ r.requester }}<UIcon v-if="r.emergency" name="i-lucide-siren" class="ml-1 size-3.5 text-rose-400" /></td>
              <td class="px-3 py-2 text-(--color-muted)">{{ r.action }}</td>
              <td class="px-3 py-2 text-faint">{{ r.account_count }}</td>
              <td class="px-3 py-2 max-w-xs truncate text-(--color-muted)">{{ r.reason }}</td>
              <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 text-xs" :class="statusBadge[r.status]">{{ r.status }}</span></td>
              <td class="px-3 py-2 text-xs text-faint">{{ shortTime(r.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>
  </div>
</template>
