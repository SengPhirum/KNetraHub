<script setup lang="ts">
// Preferences > Security > Login activity. The user's own recent sign-ins,
// read from the audit log via /api/user/login-activity (self-service).
interface LoginEvent { id: string; action: string; detail: string; ts: string }

const { data: events, status, refresh } = useFetch<LoginEvent[]>('/api/user/login-activity', { default: () => [] })

function fmt(ts: string) {
  return new Date(ts).toLocaleString()
}
function isFailure(action: string) {
  return action.includes('failed')
}
</script>

<template>
  <div>
    <PageHeader title="Login activity" subtitle="Your recent sign-ins to this portal" icon="i-lucide-history">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="status === 'pending'" @click="refresh()" />
      </template>
    </PageHeader>

    <div class="panel p-5 max-w-2xl">
      <div v-if="!events?.length" class="rounded-lg border border-dashed border-hull p-6 text-center text-sm text-(--color-muted)">
        No sign-in history recorded yet.
      </div>
      <div v-else class="divide-y divide-hull">
        <div v-for="ev in events" :key="ev.id" class="flex items-center gap-3 py-3">
          <UIcon
            :name="isFailure(ev.action) ? 'i-lucide-shield-x' : 'i-lucide-log-in'"
            class="size-4 shrink-0"
            :class="isFailure(ev.action) ? 'text-down' : 'text-beacon'"
          />
          <div class="min-w-0 flex-1">
            <p class="text-sm text-foam">{{ isFailure(ev.action) ? 'Failed sign-in' : 'Signed in' }}</p>
            <p class="text-xs text-faint">{{ ev.detail }}</p>
          </div>
          <p class="shrink-0 text-xs text-faint">{{ fmt(ev.ts) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
