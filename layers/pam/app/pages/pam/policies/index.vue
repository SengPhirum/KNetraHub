<script setup lang="ts">
// Access (approval) policies. Safes with no explicit policy use the built-in
// default (single manager approval, recording required, no self-approval).
const { data, status, error } = useAsyncData('pamPolicies',
  () => $fetch<any[]>('/api/pam/v1/access-policies'), { server: false, default: () => [] })
</script>

<template>
  <div>
    <PageHeader title="Access policies" subtitle="Approval workflows and access controls" icon="i-lucide-scale" />
    <UAlert color="info" variant="soft" class="mb-4" icon="i-lucide-info"
      title="Default policy"
      description="Safes without an assigned policy require a single manager approval, mandatory recording, no self-approval, and a 4-hour maximum session. Assign a policy to a safe to change this." />
    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No custom policies. The built-in default applies.">
      <div class="space-y-3">
        <div v-for="p in data" :key="p.id" class="panel p-4">
          <div class="mb-1 flex items-center justify-between">
            <p class="font-display font-semibold text-foam">{{ p.name }}</p>
            <span class="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-(--color-muted)">{{ p.approval_type }}</span>
          </div>
          <p v-if="p.description" class="mb-2 text-sm text-(--color-muted)">{{ p.description }}</p>
          <div class="flex flex-wrap gap-3 text-xs text-faint">
            <span>Ticket: {{ p.require_ticket ? 'required' : 'no' }}</span>
            <span>MFA: {{ p.require_mfa ? 'required' : 'no' }}</span>
            <span>Recording: {{ p.require_recording ? 'required' : 'no' }}</span>
            <span>Max {{ p.max_duration_minutes }}m · {{ p.max_concurrent_sessions }} concurrent</span>
            <span>{{ p.rules.length }} approval level(s)</span>
          </div>
        </div>
      </div>
    </DataState>
  </div>
</template>
