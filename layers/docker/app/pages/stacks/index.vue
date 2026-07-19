<script setup lang="ts">
const { can } = useAuth()
const { prefs } = usePreferences()
const { relative } = useFormat()
const toast = useToast()

const { data, status, error, refreshing, refresh } = useApiCache('stacks', () => $fetch<any[]>('/api/stacks'))
onMounted(refresh)
const { data: gl } = useFetch('/api/gitlab/status', { lazy: true })

const { connected } = useDockerEvents((evt) => {
  if (evt.type === 'resource-list' && evt.resource === 'stacks') data.value = evt.data
})
useIntervalFn(() => {
  if (!connected.value && prefs.value.refreshInterval > 0) refresh()
}, computed(() => prefs.value.refreshInterval > 0 ? prefs.value.refreshInterval * 1000 : 60_000), { immediate: false })

const stackSortOptions = [
  { label: 'Name', value: 'name' },
  {
    label: 'Status',
    value: 'status',
    getValue: (s: any) => (STATUS_RANK[stackStatus(s)] ?? 4)
  },
  { label: 'Services', value: 'services' },
  { label: 'Running tasks', value: 'runningTasks' },
  { label: 'Desired tasks', value: 'desiredTasks' },
  { label: 'Networks', value: 'networks' },
  { label: 'Volumes', value: 'volumes' },
  { label: 'Configs', value: 'configs' },
  { label: 'Secrets', value: 'secrets' },
  { label: 'Updated', value: 'updatedAt' },
  { label: 'Git tracked', value: 'inGit' }
]
const STATUS_RANK: Record<string, number> = { failed: 0, partial: 1, defined: 2, deployed: 3 }
const stackFilterOptions = [
  { key: 'inGit', label: 'Git tracked', getValue: (s: any) => s.inGit ? 'Yes' : 'No' },
  { key: 'tracked', label: 'History tracked', getValue: (s: any) => (s.inGit || s.inLocal) ? 'Yes' : 'No' }
]
const { items: filtered, search, sortBy, sortDir, sortOptions, filters, facets } = useListControls('stacks', data, {
  sortOptions: stackSortOptions,
  defaultSortBy: 'name',
  filterOptions: stackFilterOptions
})

function stackStatus(s: any) {
  if (!s.services) return 'defined'
  if (s.status === 'failed' || s.failedTasks > 0 || s.issueTasks > 0) return 'failed'
  return s.status || (s.runningTasks >= s.desiredTasks && s.desiredTasks > 0 ? 'deployed' : 'partial')
}

function stackDanger(s: any) {
  return stackStatus(s) === 'failed'
}

function stackIssue(s: any) {
  const failed = Number(s.failedTasks || 0)
  const issue = Array.isArray(s.issues) ? s.issues[0] : ''
  if (issue) return issue
  if (failed) return `${failed} current ${failed === 1 ? 'task is' : 'tasks are'} failed`
  return 'A service cannot reach its desired state'
}

const open = ref(false)
function openDeploy() { open.value = true }

const historyOpen = ref(false)
const historyName = ref<string | null>(null)
function openHistory(s: any) {
  historyName.value = s.name
  historyOpen.value = true
}

// Deleting from version control is irreversible - it must be confirmed with
// the user's password (enforced server-side, see requirePasswordConfirm).
const deleteTarget = ref<any | null>(null)
function deleteFromTracking(s: any) {
  deleteTarget.value = s
}
async function confirmDeleteFromTracking(password: string) {
  const s = deleteTarget.value
  if (!s) return
  await $fetch(`/api/stacks/${s.name}?git=true`, {
    method: 'DELETE',
    headers: { 'x-confirm-password': password }
  })
  toast.add({ title: `Deleted ${s.name} from version control`, color: 'primary' })
  refresh()
}

function onDeployed() {
  refresh()
}
</script>

<template>
  <div>
    <PageHeader title="Stacks" subtitle="Compose-defined application stacks with tracked deploy history" icon="i-lucide-layers">
      <template #actions>
        <ListControls
          inline
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          v-model:filters="filters"
          :sort-options="sortOptions"
          :facets="facets"
          placeholder="Search stacks"
        />
        <div class="flex items-center gap-1.5 text-xs text-faint select-none">
          <span class="dot" :class="connected ? 'dot-running' : 'dot-idle'" />
          {{ connected ? 'Live' : prefs.refreshInterval > 0 ? `${prefs.refreshInterval}s` : 'Manual' }}
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-rocket" color="primary" label="Deploy stack" @click="openDeploy" />
      </template>
    </PageHeader>

    <div v-if="gl && !gl.enabled" class="notice-warning panel p-3 mb-4 flex items-center gap-2 text-sm">
      <UIcon name="i-lucide-info" class="size-4 shrink-0" />
      Deploy history is tracked in the local database. Connect GitLab (Dock &rarr; Settings &rarr; Integrations) to also version compose files in Git — histories sync both ways once connected.
    </div>

    <DataState :status="status" :error="error" :empty="filtered.length === 0" :refreshing="refreshing" empty-label="No stacks deployed yet." empty-icon="i-lucide-layers">
      <section class="panel p-0 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="border-y border-hull text-xs uppercase tracking-wide text-faint">
              <tr>
                <th class="px-4 py-3 font-medium">Name</th>
                <th class="px-4 py-3 font-medium">Services</th>
                <th class="px-4 py-3 font-medium">Networks</th>
                <th class="px-4 py-3 font-medium">Volumes</th>
                <th class="px-4 py-3 font-medium">Configs</th>
                <th class="px-4 py-3 font-medium">Secrets</th>
                <th class="px-4 py-3 font-medium">Updated</th>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody class="divide-y divide-hull">
              <tr v-if="!filtered.length">
                <td colspan="9" class="px-4 py-8 text-center text-(--color-muted)">No stacks deployed yet.</td>
              </tr>
              <tr
                v-for="s in filtered"
                :key="s.name"
                class="cursor-pointer align-top transition"
                :class="stackDanger(s) ? 'bg-down/10 hover:bg-down/15' : 'hover:bg-surface-2/60'"
                tabindex="0"
                role="link"
                :aria-label="`Open stack ${s.name}`"
                @click="navigateTo(`/stacks/${s.name}`)"
                @keydown.enter="navigateTo(`/stacks/${s.name}`)"
              >
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-layers" class="size-4 shrink-0" :class="stackDanger(s) ? 'text-(--color-down-ink)' : 'text-beacon'" />
                    <span class="truncate font-medium" :class="stackDanger(s) ? 'text-(--color-down-ink)' : 'text-foam'">{{ s.name }}</span>
                    <span v-if="s.inGit" class="inline-flex shrink-0 items-center gap-1 rounded bg-beacon/10 px-1.5 py-0.5 text-[10px] font-medium text-beacon ring-1 ring-beacon/20" title="Tracked in GitLab">
                      <UIcon name="i-lucide-git-branch" class="size-3" /> git
                    </span>
                    <span v-if="s.inLocal" class="inline-flex shrink-0 items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-faint ring-1 ring-hull" title="Deploy history tracked in the local database">
                      <UIcon name="i-lucide-history" class="size-3" /> history
                    </span>
                  </div>
                  <p v-if="stackDanger(s)" class="mt-0.5 max-w-md truncate text-xs text-(--color-down-ink)" :title="stackIssue(s)">{{ stackIssue(s) }}</p>
                  <p v-else-if="s.services" class="mt-0.5 truncate font-mono text-xs text-faint">{{ s.runningTasks ?? 0 }}/{{ s.desiredTasks ?? 0 }} tasks running</p>
                  <p v-else-if="s.inGit || s.inLocal" class="mt-0.5 truncate text-xs text-faint">Defined in {{ s.inGit ? 'GitLab' : 'local history' }}, not currently deployed</p>
                </td>
                <td class="px-4 py-3 font-mono" :class="stackDanger(s) ? 'text-(--color-down-ink)' : 'text-(--color-muted)'">{{ s.services }}</td>
                <td class="px-4 py-3 font-mono" :class="stackDanger(s) ? 'text-(--color-down-ink)' : 'text-(--color-muted)'">{{ s.networks }}</td>
                <td class="px-4 py-3 font-mono" :class="stackDanger(s) ? 'text-(--color-down-ink)' : 'text-(--color-muted)'">{{ s.volumes ?? 0 }}</td>
                <td class="px-4 py-3 font-mono" :class="stackDanger(s) ? 'text-(--color-down-ink)' : 'text-(--color-muted)'">{{ s.configs }}</td>
                <td class="px-4 py-3 font-mono" :class="stackDanger(s) ? 'text-(--color-down-ink)' : 'text-(--color-muted)'">{{ s.secrets }}</td>
                <td class="px-4 py-3 text-xs text-faint">{{ s.updatedAt ? relative(s.updatedAt) : '—' }}</td>
                <td class="px-4 py-3"><StatusBadge :state="stackStatus(s)" /></td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-0.5">
                    <UButton
                      v-if="s.inGit || s.inLocal"
                      icon="i-lucide-history"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      title="View deploy history"
                      @click.stop="openHistory(s)"
                    />
                    <UButton
                      v-if="can('operator') && stackStatus(s) === 'defined' && (s.inGit || s.inLocal)"
                      icon="i-lucide-trash-2"
                      color="error"
                      variant="ghost"
                      size="sm"
                      title="Delete from version control"
                      @click.stop="deleteFromTracking(s)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </DataState>

    <StacksDeployStackModal v-model:open="open" @deployed="onDeployed" />
    <StacksStackHistoryModal v-model:open="historyOpen" :name="historyName" @changed="refresh()" />
    <ConfirmPasswordModal
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete stack from version control"
      :message="deleteTarget ? `The compose file and deploy history of ${deleteTarget.name} (local database${deleteTarget.inGit ? ' and GitLab' : ''}) will be permanently removed. This cannot be undone.` : ''"
      confirm-label="Delete permanently"
      :action="confirmDeleteFromTracking"
    />
  </div>
</template>
