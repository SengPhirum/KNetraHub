<script setup lang="ts">
const { relative } = useFormat()

const { data, status, error, refreshing, refresh } = useApiCache('audit', () => $fetch<any[]>('/api/system/audit'))
onMounted(refresh)

const search = ref('')
const filtered = computed(() => {
  const q = search.value.toLowerCase()
  return (data.value ?? []).filter((a: any) => !q || a.actor?.toLowerCase().includes(q) || a.action?.toLowerCase().includes(q) || a.target?.toLowerCase().includes(q))
})

const icon: Record<string, string> = {
  deploy: 'i-lucide-rocket', rollback: 'i-lucide-history', create: 'i-lucide-plus',
  update: 'i-lucide-pencil', delete: 'i-lucide-trash-2', add: 'i-lucide-plus',
  scale: 'i-lucide-scaling', login: 'i-lucide-log-in'
}
function actionIcon(action: string) {
  const verb = action.split('.')[1] || action
  return icon[verb] || 'i-lucide-activity'
}
</script>

<template>
  <div>
    <PageHeader title="Audit log" subtitle="Every state-changing action, with actor and target" icon="i-lucide-scroll">
      <template #actions>
        <UInput v-model="search" icon="i-lucide-search" placeholder="Filter log" class="w-40 sm:w-52" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!filtered.length" :refreshing="refreshing" empty-label="No audit entries yet." empty-icon="i-lucide-scroll">
      <div class="space-y-1.5">
        <div v-for="a in filtered" :key="a.id" class="panel-flush p-3 flex items-center gap-3 text-sm">
          <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2">
            <UIcon :name="actionIcon(a.action)" class="size-4 text-beacon" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-foam">
              <span class="font-medium">{{ a.actor || '—' }}</span>
              <span class="text-(--color-muted)"> · </span>
              <span class="font-mono text-xs text-(--color-muted)">{{ a.action || '—' }}</span>
              <span v-if="a.target" class="text-faint"> → </span>
              <span v-if="a.target" class="font-mono text-xs text-foam">{{ a.target }}</span>
            </p>
            <p v-if="a.detail" class="truncate text-xs text-faint">{{ a.detail }}</p>
          </div>
          <span class="shrink-0 text-xs text-faint">{{ relative(a.ts) }}</span>
        </div>
      </div>
    </DataState>
  </div>
</template>
