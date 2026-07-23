<script setup lang="ts">
// Approver queue — pending access requests awaiting a decision.
const { shortTime } = usePam()
const { data, status, error } = useAsyncData('pamApprovals',
  () => $fetch<any[]>('/api/pam/v1/approvals'), { server: false, default: () => [] })
</script>

<template>
  <div>
    <PageHeader title="Approvals" subtitle="Requests awaiting your decision" icon="i-lucide-gavel" />
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="Nothing awaiting approval. 🎉">
      <div class="space-y-2">
        <NuxtLink v-for="r in data" :key="r.id" :to="`/pam/requests/${r.id}`" class="panel flex items-center gap-4 p-4 transition hover:ring-1 hover:ring-beacon/40">
          <UIcon :name="r.emergency ? 'i-lucide-siren' : 'i-lucide-ticket'" class="size-5" :class="r.emergency ? 'text-rose-400' : 'text-beacon'" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-foam"><span class="font-medium">{{ r.requester }}</span> · {{ r.action }} · {{ r.account_count }} account(s)</p>
            <p class="truncate text-xs text-(--color-muted)">{{ r.reason }}</p>
          </div>
          <div class="text-right text-xs text-faint">
            <p v-if="r.ticket_number">{{ r.ticket_number }}</p>
            <p>{{ shortTime(r.created_at) }}</p>
          </div>
          <UButton size="xs" icon="i-lucide-arrow-right">Review</UButton>
        </NuxtLink>
      </div>
    </DataState>
  </div>
</template>
