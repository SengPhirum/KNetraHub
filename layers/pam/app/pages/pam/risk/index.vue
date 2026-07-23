<script setup lang="ts">
// Privileged threat analytics — explainable rule-based risk events.
const toast = useToast()
const { severityMeta, shortTime } = usePam()
const { data, status, error, refresh } = useAsyncData('pamRisk',
  () => $fetch<any>('/api/pam/v1/risk'), { server: false, default: () => ({ events: [], summary: {} }) })

async function setStatus(e: any, status: string) {
  try {
    await $fetch(`/api/pam/v1/risk/${e.id}/status`, { method: 'POST', body: { status } })
    await refresh()
  } catch (err: any) { toast.add({ title: 'Could not update', description: err?.data?.statusMessage, color: 'error' }) }
}
</script>

<template>
  <div>
    <PageHeader title="Risk events" subtitle="Deterministic, explainable privileged-access analytics" icon="i-lucide-shield-alert" />
    <div class="mb-4 grid gap-3 sm:grid-cols-4">
      <StatCard label="Critical" :value="data.summary.critical || 0" icon="i-lucide-flame" :accent="(data.summary.critical||0)>0" />
      <StatCard label="High" :value="data.summary.high || 0" icon="i-lucide-triangle-alert" :accent="(data.summary.high||0)>0" />
      <StatCard label="Medium" :value="data.summary.medium || 0" icon="i-lucide-alert-circle" />
      <StatCard label="Low" :value="data.summary.low || 0" icon="i-lucide-info" />
    </div>
    <DataState :status="status" :error="error" :empty="!data.events.length" empty-label="No open risk events. 🎉">
      <div class="space-y-2">
        <div v-for="e in data.events" :key="e.id" class="panel p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="mb-1 flex items-center gap-2">
                <span class="rounded px-1.5 py-0.5 text-xs" :class="severityMeta(e.severity).badge">{{ severityMeta(e.severity).label }}</span>
                <span class="font-medium text-foam">{{ e.rule_name }}</span>
                <span class="text-xs text-faint">· confidence {{ e.confidence }}%</span>
              </div>
              <p class="text-sm text-(--color-muted)">{{ e.explanation }}</p>
              <p class="mt-1 text-xs text-faint">{{ e.actor || 'system' }}{{ e.target ? ' · ' + e.target : '' }} · {{ shortTime(e.created_at) }}</p>
              <p v-if="e.recommended_action" class="mt-1 text-xs text-beacon">Recommended: {{ e.recommended_action }}</p>
            </div>
            <div class="flex shrink-0 gap-1">
              <UButton size="xs" variant="soft" @click="setStatus(e, 'investigating')">Investigate</UButton>
              <UButton size="xs" color="success" variant="soft" @click="setStatus(e, 'resolved')">Resolve</UButton>
              <UButton size="xs" color="neutral" variant="ghost" @click="setStatus(e, 'dismissed')">Dismiss</UButton>
            </div>
          </div>
        </div>
      </div>
    </DataState>
  </div>
</template>
