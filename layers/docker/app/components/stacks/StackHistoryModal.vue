<script setup lang="ts">
// Version-history timeline for one stack, opened from the stack list. Shows
// the merged trail (local DB rows + GitLab commits), lets an operator view a
// version's compose, roll back to it, and - when GitLab is configured -
// two-way sync the local trail with the repo.
const props = defineProps<{ name: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ changed: [] }>()

const { can } = useAuth()
const { relative, short } = useFormat()
const toast = useToast()

interface HistoryEntry {
  id: string
  shortId: string
  message: string
  author: string | null
  date: string
  source: 'local' | 'gitlab' | 'synced'
}

const loading = ref(false)
const history = ref<HistoryEntry[]>([])
const gitlabOn = ref(false)
const syncing = ref(false)
const rollingBack = ref<string | null>(null)

const viewing = ref<HistoryEntry | null>(null)
const viewContent = ref('')
const viewLoading = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  viewing.value = null
  viewContent.value = ''
  load()
})

async function load() {
  if (!props.name) return
  loading.value = true
  try {
    const res = await $fetch<{ gitlabEnabled: boolean; history: HistoryEntry[] }>(`/api/stacks/${props.name}/history`)
    history.value = res.history
    gitlabOn.value = res.gitlabEnabled
  } catch (e: any) {
    toast.add({ title: 'Failed to load history', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function sourceBadge(source: HistoryEntry['source']) {
  if (source === 'synced') return { label: 'local + git', color: 'primary' as const, icon: 'i-lucide-refresh-cw' }
  if (source === 'gitlab') return { label: 'git only', color: 'warning' as const, icon: 'i-lucide-git-branch' }
  return { label: 'local', color: 'neutral' as const, icon: 'i-lucide-database' }
}

async function view(entry: HistoryEntry) {
  viewing.value = entry
  viewLoading.value = true
  viewContent.value = ''
  try {
    const res = await $fetch<{ compose: string }>(`/api/stacks/${props.name}/history/${entry.id}`)
    viewContent.value = res.compose
  } catch (e: any) {
    viewContent.value = `# Failed to load: ${e?.data?.statusMessage || e?.message}`
  } finally {
    viewLoading.value = false
  }
}

async function rollback(entry: HistoryEntry) {
  if (!confirm(`Roll back "${props.name}" to version ${entry.shortId}? This records and redeploys the older version.`)) return
  rollingBack.value = entry.id
  try {
    await $fetch(`/api/stacks/${props.name}/rollback`, { method: 'POST', headers: { 'x-knetra-action-target': props.name }, body: { version: entry.id } })
    toast.add({ title: `Rolled back ${props.name}`, description: `to ${entry.shortId}`, color: 'primary', icon: 'i-lucide-history' })
    viewing.value = null
    emit('changed')
    await load()
  } catch (e: any) {
    toast.add({ title: 'Rollback failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    rollingBack.value = null
  }
}

async function syncWithGitlab() {
  syncing.value = true
  try {
    const res = await $fetch<{ pulled: number; pushed: number }>(`/api/stacks/${props.name}/history/sync`, { method: 'POST', headers: { 'x-knetra-action-target': props.name } })
    toast.add({ title: 'History synced with GitLab', description: `${res.pulled} pulled, ${res.pushed} pushed`, color: 'primary', icon: 'i-lucide-refresh-cw' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Sync failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="`History: ${name || ''}`" description="Every deploy is versioned - locally by default, and in GitLab when the integration is connected." :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <!-- Version compose viewer (drill-in) -->
      <div v-if="viewing" class="space-y-3">
        <button type="button" class="flex items-center gap-1.5 text-xs text-faint transition hover:text-foam" @click="viewing = null">
          <UIcon name="i-lucide-arrow-left" class="size-3.5" /> Back to timeline
        </button>
        <div>
          <p class="text-sm font-medium text-foam">{{ viewing.message || '-' }}</p>
          <p class="mt-0.5 text-xs text-faint">
            {{ viewing.author || '-' }} - {{ relative(viewing.date) }} - <span class="font-mono">{{ viewing.shortId }}</span>
          </p>
        </div>
        <div v-if="viewLoading" class="flex items-center justify-center py-12 text-(--color-muted)">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mr-2" /> Loading...
        </div>
        <pre v-else class="logstream max-h-[50vh] overflow-auto rounded-lg p-3 text-xs">{{ viewContent }}</pre>
      </div>

      <!-- Timeline -->
      <div v-else>
        <div v-if="gitlabOn && can('operator')" class="mb-3 flex justify-end">
          <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-refresh-cw" label="Sync with GitLab" :loading="syncing" @click="syncWithGitlab" />
        </div>
        <div v-if="loading" class="flex items-center justify-center py-12 text-(--color-muted)">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mr-2" /> Loading...
        </div>
        <div v-else-if="!history.length" class="rounded-lg border border-dashed border-hull p-8 text-center text-sm text-(--color-muted)">
          No versions recorded yet. Deploy this stack once to start its history.
        </div>
        <div v-else class="max-h-[55vh] overflow-y-auto pr-1">
          <div v-for="(entry, i) in history" :key="entry.id" class="relative flex gap-3 pl-1">
            <div class="flex flex-col items-center">
              <span class="mt-1.5 size-2.5 rounded-full bg-beacon ring-4 ring-beacon/10" />
              <span v-if="i < history.length - 1" class="w-px flex-1 bg-hull" />
            </div>
            <div class="panel-flush mb-3 flex-1 p-3.5">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-foam">{{ entry.message || '-' }}</p>
                  <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
                    <span>{{ entry.author || '-' }} - {{ relative(entry.date) }} - <span class="font-mono">{{ short(entry.id, 8) }}</span></span>
                    <UBadge :color="sourceBadge(entry.source).color" variant="subtle" size="sm" :icon="sourceBadge(entry.source).icon" :label="sourceBadge(entry.source).label" />
                    <span v-if="i === 0" class="status-current rounded px-1.5 py-0.5 text-[10px]">current</span>
                  </p>
                </div>
                <div class="flex shrink-0 gap-1.5">
                  <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-eye" label="View" @click="view(entry)" />
                  <UButton
                    v-if="can('operator') && i > 0"
                    size="xs" color="warning" variant="soft" icon="i-lucide-history" label="Rollback"
                    :loading="rollingBack === entry.id"
                    @click="rollback(entry)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton v-if="viewing && can('operator')" color="warning" icon="i-lucide-history" label="Roll back to this" :loading="rollingBack === viewing.id" @click="rollback(viewing)" />
        <UButton color="neutral" variant="ghost" label="Close" @click="open = false" />
      </div>
    </template>
  </UModal>
</template>
