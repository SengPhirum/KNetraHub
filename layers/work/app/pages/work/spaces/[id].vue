<script setup lang="ts">
// Space detail: folders + lists management, status workflow editor, tags,
// sharing (private spaces), and space settings.
const route = useRoute()
const spaceId = computed(() => String(route.params.id))
const { canCreate, canUpdate, canShare, canDelete } = useWork()
const toast = useToast()

const { data: space, status, error, refresh } = useAsyncData(
  () => `workSpace:${spaceId.value}`,
  () => $fetch<any>(`/api/work/v1/spaces/${spaceId.value}`),
  { server: false, watch: [spaceId] }
)
const { data: members } = useAsyncData('workMembers',
  () => $fetch<any[]>('/api/work/v1/members'), { server: false, default: () => [] })

function fail(e: any, what: string) {
  toast.add({ title: `Could not ${what}`, description: e?.data?.statusMessage || e?.message, color: 'error' })
}

// ── Folders & lists ──────────────────────────────────────────────────────────
const newFolder = ref('')
const newList = reactive({ name: '', folder_id: '' as string | '' })
async function addFolder() {
  if (!newFolder.value.trim()) return
  try {
    await $fetch('/api/work/v1/folders', { method: 'POST', body: { space_id: spaceId.value, name: newFolder.value } })
    newFolder.value = ''
    await refresh()
  } catch (e: any) { fail(e, 'create folder') }
}
async function addList() {
  if (!newList.name.trim()) return
  try {
    await $fetch('/api/work/v1/lists', {
      method: 'POST', body: { space_id: spaceId.value, name: newList.name, folder_id: newList.folder_id || undefined }
    })
    Object.assign(newList, { name: '', folder_id: '' })
    await refresh()
  } catch (e: any) { fail(e, 'create list') }
}
const folderItems = computed(() => [
  { label: 'No folder', value: '' },
  ...(space.value?.folders || []).map((f: any) => ({ label: f.name, value: f.id }))
])

// ── Status workflow editor ───────────────────────────────────────────────────
const editStatuses = ref(false)
const statusDraft = ref<any[]>([])
const savingStatuses = ref(false)
watch(space, (s) => { if (s) statusDraft.value = (s.statuses || []).map((x: any) => ({ ...x })) }, { immediate: true })
function addStatusRow() {
  statusDraft.value.push({ id: null, name: '', color: '#6b7280', status_group: 'active' })
}
async function saveStatuses(force = false) {
  savingStatuses.value = true
  try {
    await $fetch(`/api/work/v1/spaces/${spaceId.value}/statuses`, {
      method: 'PUT',
      body: { statuses: statusDraft.value.filter((s) => s.name?.trim()), force }
    })
    toast.add({ title: 'Statuses updated', color: 'success' })
    editStatuses.value = false
    await refresh()
  } catch (e: any) {
    const message = e?.data?.statusMessage || e?.message || ''
    if (!force && String(e?.data?.statusCode || e?.statusCode) === '409' && message.includes('force=true')) {
      if (confirm(`${message}\n\nRemap those tasks to the first status and continue?`)) return saveStatuses(true)
    } else fail(e, 'save statuses')
  } finally { savingStatuses.value = false }
}
const groupItems = [
  { label: 'Open', value: 'open' }, { label: 'Active', value: 'active' },
  { label: 'Done', value: 'done' }, { label: 'Closed', value: 'closed' }
]

// ── Tags ─────────────────────────────────────────────────────────────────────
const newTag = reactive({ name: '', color: '#6b7280' })
async function addTag() {
  if (!newTag.name.trim()) return
  try {
    await $fetch('/api/work/v1/tags', { method: 'POST', body: { space_id: spaceId.value, ...newTag } })
    Object.assign(newTag, { name: '', color: '#6b7280' })
    await refresh()
  } catch (e: any) { fail(e, 'create tag') }
}
async function removeTag(tag: any) {
  try {
    await $fetch(`/api/work/v1/tags/${tag.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e: any) { fail(e, 'delete tag') }
}

// ── Sharing (private spaces) ─────────────────────────────────────────────────
const shareUser = ref<string | null>(null)
const shareAccess = ref('edit')
async function share() {
  if (!shareUser.value) return
  try {
    await $fetch(`/api/work/v1/spaces/${spaceId.value}/members`, {
      method: 'POST', body: { username: shareUser.value, access: shareAccess.value }
    })
    shareUser.value = null
    await refresh()
  } catch (e: any) { fail(e, 'share space') }
}
async function unshare(member: any) {
  try {
    await $fetch(`/api/work/v1/spaces/${spaceId.value}/members/${encodeURIComponent(member.username)}`, { method: 'DELETE' })
    await refresh()
  } catch (e: any) { fail(e, 'revoke access') }
}
const memberItems = computed(() => (members.value || []).map((m: any) => m.username))

// ── Space settings ───────────────────────────────────────────────────────────
async function archiveSpace() {
  if (!confirm(`Archive space "${space.value.name}"? It can be restored from the API.`)) return
  try {
    await $fetch(`/api/work/v1/spaces/${spaceId.value}`, { method: 'PATCH', body: { archived: true, version: space.value.version } })
    toast.add({ title: 'Space archived', color: 'success' })
    navigateTo('/work/spaces')
  } catch (e: any) { fail(e, 'archive space') }
}
async function deleteSpace() {
  const confirmName = prompt(`Permanently delete "${space.value.name}" and ALL its lists and tasks?\nType the exact space name to confirm:`)
  if (confirmName === null) return
  try {
    await $fetch(`/api/work/v1/spaces/${spaceId.value}`, { method: 'DELETE', body: { confirm_name: confirmName } })
    toast.add({ title: 'Space permanently deleted', color: 'success' })
    navigateTo('/work/spaces')
  } catch (e: any) { fail(e, 'delete space') }
}
</script>

<template>
  <div>
    <DataState :status="status" :error="error">
      <template v-if="space">
        <PageHeader :title="space.name" :subtitle="space.description || 'Space'" icon="i-lucide-layout-grid">
          <template #actions>
            <UButton v-if="canUpdate" size="sm" variant="soft" icon="i-lucide-workflow" @click="editStatuses = true">Statuses</UButton>
            <UDropdownMenu v-if="canUpdate || canDelete" :items="[[
              { label: 'Archive space', icon: 'i-lucide-archive', onSelect: archiveSpace, disabled: !canUpdate },
              { label: 'Delete permanently', icon: 'i-lucide-trash-2', color: 'error', onSelect: deleteSpace, disabled: !canDelete }
            ]]">
              <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-ellipsis-vertical" />
            </UDropdownMenu>
          </template>
        </PageHeader>

        <div class="grid gap-4 lg:grid-cols-3">
          <!-- Hierarchy -->
          <div class="space-y-4 lg:col-span-2">
            <div class="panel p-4">
              <p class="mb-3 text-sm font-semibold text-foam">Folders & lists</p>
              <div class="space-y-3">
                <div v-for="folder in space.folders" :key="folder.id" class="rounded-lg bg-surface/50 p-3 ring-1 ring-hull">
                  <p class="mb-2 flex items-center gap-1.5 text-sm font-medium text-foam">
                    <UIcon name="i-lucide-folder" class="size-4 text-beacon" /> {{ folder.name }}
                  </p>
                  <div class="space-y-1">
                    <NuxtLink
                      v-for="list in folder.lists" :key="list.id" :to="`/work/lists/${list.id}`"
                      class="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-(--color-muted) transition hover:bg-surface hover:text-foam"
                    >
                      <UIcon :name="list.icon || 'i-lucide-list'" class="size-3.5" />
                      <span class="flex-1 truncate">{{ list.name }}</span>
                      <span class="text-xs text-faint">{{ list.open_tasks }} open</span>
                    </NuxtLink>
                  </div>
                </div>
                <NuxtLink
                  v-for="list in space.lists" :key="list.id" :to="`/work/lists/${list.id}`"
                  class="flex items-center gap-2 rounded-lg bg-surface/50 p-3 ring-1 ring-hull transition hover:ring-beacon/40"
                >
                  <UIcon :name="list.icon || 'i-lucide-list'" class="size-4 text-beacon" />
                  <span class="flex-1 truncate text-sm text-foam">{{ list.name }}</span>
                  <span class="text-xs text-faint">{{ list.open_tasks }} open</span>
                </NuxtLink>
              </div>

              <div v-if="canCreate" class="mt-4 grid gap-2 sm:grid-cols-2">
                <div class="flex gap-2">
                  <UInput v-model="newFolder" size="sm" class="flex-1" placeholder="New folder…" @keydown.enter="addFolder" />
                  <UButton size="sm" variant="soft" icon="i-lucide-folder-plus" @click="addFolder" />
                </div>
                <div class="flex gap-2">
                  <UInput v-model="newList.name" size="sm" class="flex-1" placeholder="New list…" @keydown.enter="addList" />
                  <USelect v-model="newList.folder_id" :items="folderItems" value-key="value" size="sm" class="w-32" />
                  <UButton size="sm" variant="soft" icon="i-lucide-list-plus" @click="addList" />
                </div>
              </div>
            </div>
          </div>

          <!-- Side: statuses, tags, sharing -->
          <div class="space-y-4">
            <div class="panel p-4">
              <p class="mb-2 text-sm font-semibold text-foam">Status workflow</p>
              <div class="space-y-1.5">
                <div v-for="s in space.statuses" :key="s.id" class="flex items-center gap-2 text-sm">
                  <span class="size-2.5 rounded-full" :style="{ backgroundColor: s.color }" />
                  <span class="flex-1 text-(--color-muted)">{{ s.name }}</span>
                  <span class="text-[10px] uppercase text-faint">{{ s.status_group }}</span>
                </div>
              </div>
            </div>

            <div class="panel p-4">
              <p class="mb-2 text-sm font-semibold text-foam">Tags</p>
              <div class="flex flex-wrap gap-1.5">
                <span v-for="tag in space.tags" :key="tag.id" class="group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ring-inset" :style="{ color: tag.color, '--tw-ring-color': tag.color + '55', backgroundColor: tag.color + '1a' }">
                  {{ tag.name }}
                  <button v-if="canUpdate" class="hidden group-hover:inline" @click="removeTag(tag)"><UIcon name="i-lucide-x" class="size-3" /></button>
                </span>
                <p v-if="!space.tags?.length" class="text-xs text-faint">No tags yet.</p>
              </div>
              <div v-if="canUpdate" class="mt-2 flex gap-2">
                <UInput v-model="newTag.name" size="xs" class="flex-1" placeholder="New tag…" @keydown.enter="addTag" />
                <UInput v-model="newTag.color" type="color" size="xs" class="w-10" />
                <UButton size="xs" variant="soft" icon="i-lucide-plus" @click="addTag" />
              </div>
            </div>

            <div v-if="space.private" class="panel p-4">
              <p class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foam">
                <UIcon name="i-lucide-lock" class="size-4 text-amber-400" /> Private space members
              </p>
              <div class="space-y-1">
                <div v-for="m in space.members" :key="m.username" class="flex items-center gap-2 text-sm">
                  <span class="flex size-5 items-center justify-center rounded-full text-[9px] font-semibold text-white" :style="{ backgroundColor: userColor(m.username) }">{{ userInitials(m.username) }}</span>
                  <span class="flex-1 text-(--color-muted)">{{ m.username }}</span>
                  <span class="text-xs text-faint">{{ m.access }}</span>
                  <UButton v-if="canShare" size="xs" variant="ghost" color="error" icon="i-lucide-x" @click="unshare(m)" />
                </div>
                <p class="text-xs text-faint">Creator ({{ space.created_by }}) always has full access.</p>
              </div>
              <div v-if="canShare" class="mt-2 flex gap-2">
                <USelectMenu v-model="shareUser" :items="memberItems" size="xs" class="flex-1" placeholder="Add member…" />
                <USelect v-model="shareAccess" :items="['view', 'comment', 'edit', 'full']" size="xs" class="w-24" />
                <UButton size="xs" variant="soft" icon="i-lucide-user-plus" @click="share" />
              </div>
            </div>
          </div>
        </div>

        <!-- Status editor modal -->
        <UModal v-model:open="editStatuses" title="Edit status workflow" :ui="{ content: 'max-w-xl' }">
          <template #body>
            <div class="space-y-2">
              <div v-for="(s, i) in statusDraft" :key="s.id || i" class="flex items-center gap-2">
                <UInput v-model="s.color" type="color" class="w-10" />
                <UInput v-model="s.name" class="flex-1" placeholder="Status name" />
                <USelect v-model="s.status_group" :items="groupItems" value-key="value" class="w-28" />
                <UButton size="xs" variant="ghost" color="error" icon="i-lucide-x" @click="statusDraft.splice(i, 1)" />
              </div>
              <UButton size="xs" variant="soft" icon="i-lucide-plus" @click="addStatusRow">Add status</UButton>
              <p class="text-xs text-faint">Removing a status that tasks still use asks before remapping them to the first status. Lists inherit this workflow unless they define their own.</p>
            </div>
          </template>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="editStatuses = false">Cancel</UButton>
              <UButton :loading="savingStatuses" @click="saveStatuses(false)">Save workflow</UButton>
            </div>
          </template>
        </UModal>
      </template>
    </DataState>
  </div>
</template>
