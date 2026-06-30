<script setup lang="ts">
const { hasApp } = useAuth()

const { data: groups, status, refresh } = useAsyncData('netGroups', () => $fetch<any[]>('/api/net/groups'))
const { data: devices } = useAsyncData('netGroupsDevices', () => $fetch<any[]>('/api/net/devices'))

// --- Create -----------------------------------------------------------------
const createOpen = ref(false)
const createForm = reactive({ name: '', description: '' })
const saving = ref(false)

function openCreate() {
  createForm.name = ''
  createForm.description = ''
  createOpen.value = true
}
async function createGroup() {
  if (!createForm.name.trim()) return
  saving.value = true
  try {
    await $fetch('/api/net/groups', { method: 'POST', body: { ...createForm } })
    createOpen.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- Manage (edit + membership) ---------------------------------------------
const manageOpen = ref(false)
const manageGroup = ref<any>(null)
const manageForm = reactive({ name: '', description: '' })
const memberIds = ref<Set<string>>(new Set())
const memberSearch = ref('')

const filteredDevices = computed(() => {
  const list = devices.value || []
  const s = memberSearch.value.toLowerCase().trim()
  if (!s) return list
  return list.filter((d) => d.hostname.toLowerCase().includes(s) || d.ip.includes(s))
})

async function openManage(group: any) {
  manageGroup.value = group
  manageForm.name = group.name
  manageForm.description = group.description || ''
  memberSearch.value = ''
  memberIds.value = new Set()
  manageOpen.value = true
  // Load current membership.
  const full = await $fetch<any>(`/api/net/groups/${group.id}`)
  memberIds.value = new Set(full.device_ids || [])
}
function toggleMember(id: string) {
  const next = new Set(memberIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  memberIds.value = next
}
async function saveManage() {
  if (!manageGroup.value || !manageForm.name.trim()) return
  saving.value = true
  try {
    await Promise.all([
      $fetch(`/api/net/groups/${manageGroup.value.id}`, { method: 'PUT', body: { ...manageForm } }),
      $fetch(`/api/net/groups/${manageGroup.value.id}/members`, { method: 'PUT', body: { device_ids: [...memberIds.value] } })
    ])
    manageOpen.value = false
    await refresh()
  } finally {
    saving.value = false
  }
}

// --- Delete -----------------------------------------------------------------
const deleteTarget = ref<any>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await $fetch(`/api/net/groups/${deleteTarget.value.id}`, { method: 'DELETE' })
    deleteTarget.value = null
    await refresh()
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Device Groups" subtitle="Logical organization and maintenance" icon="i-lucide-folder-tree">
      <template #actions>
        <UButton v-if="hasApp('net')" icon="i-lucide-plus" size="sm" @click="openCreate">Create Group</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('net')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Net.</p>
    </div>

    <template v-else>
      <div v-if="status === 'pending' && !groups" class="panel p-10 text-center text-faint">Loading groups...</div>

      <div v-else-if="!groups?.length" class="panel flex flex-col items-center gap-2 p-10 text-center">
        <UIcon name="i-lucide-folder-plus" class="size-7 text-beacon" />
        <h2 class="font-display text-lg font-semibold text-foam">No groups yet</h2>
        <p class="max-w-md text-sm text-(--color-muted)">Create a group to logically organize devices (by site, role, or owner) and act on them together.</p>
        <UButton class="mt-2" icon="i-lucide-plus" size="sm" @click="openCreate">Create Group</UButton>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div v-for="group in groups" :key="group.id" class="panel p-5 flex flex-col">
          <div class="flex items-start justify-between mb-2">
            <h3 class="text-foam font-semibold">{{ group.name }}</h3>
            <UIcon name="i-lucide-folder" class="size-5 text-(--color-muted)" />
          </div>
          <p class="text-sm text-(--color-muted) mb-4 min-h-10">{{ group.description || 'No description' }}</p>
          <div class="flex items-center justify-between mt-auto pt-4 border-t border-surface">
            <span class="text-xs text-faint font-medium uppercase">{{ group.device_count }} Devices</span>
            <div class="flex items-center gap-1">
              <UButton size="xs" variant="ghost" icon="i-lucide-settings-2" @click="openManage(group)">Manage</UButton>
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete group" @click="deleteTarget = group" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Create group -->
    <UModal v-model:open="createOpen" title="Create Group">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name">
            <UInput v-model="createForm.name" placeholder="Core Switches" class="w-full" autofocus @keyup.enter="createGroup" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="createForm.description" placeholder="What lives in this group?" class="w-full" :rows="2" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 w-full">
          <UButton variant="ghost" @click="createOpen = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" :disabled="!createForm.name.trim()" @click="createGroup">Create</UButton>
        </div>
      </template>
    </UModal>

    <!-- Manage group -->
    <UModal v-model:open="manageOpen" title="Manage Group" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name">
            <UInput v-model="manageForm.name" class="w-full" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="manageForm.description" class="w-full" :rows="2" />
          </UFormField>
          <UFormField :label="`Members (${memberIds.size} selected)`">
            <UInput v-model="memberSearch" icon="i-lucide-search" placeholder="Search hostname or IP..." class="w-full mb-2" />
            <div class="max-h-64 overflow-y-auto rounded-lg border border-surface divide-y divide-surface">
              <div v-if="!filteredDevices.length" class="px-3 py-6 text-center text-xs text-faint">No devices.</div>
              <label
                v-for="dev in filteredDevices"
                :key="dev.id"
                class="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-2/50 transition"
              >
                <UCheckbox :model-value="memberIds.has(dev.id)" @update:model-value="toggleMember(dev.id)" />
                <span class="size-2 rounded-full" :class="dev.status === 'up' ? 'bg-emerald-500' : dev.status === 'paused' ? 'bg-amber-500' : 'bg-rose-500'"></span>
                <span class="text-sm text-foam">{{ dev.hostname }}</span>
                <span class="font-mono text-xs text-faint ml-auto">{{ dev.ip }}</span>
              </label>
            </div>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 w-full">
          <UButton variant="ghost" @click="manageOpen = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" :disabled="!manageForm.name.trim()" @click="saveManage">Save Changes</UButton>
        </div>
      </template>
    </UModal>

    <!-- Delete confirmation -->
    <UModal :open="!!deleteTarget" @update:open="(v) => { if (!v) deleteTarget = null }" title="Delete group">
      <template #body>
        <p class="text-sm text-(--color-muted)">
          Delete the group <span class="font-medium text-foam">{{ deleteTarget?.name }}</span>?
          The devices in it are not affected — only the grouping is removed.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 w-full">
          <UButton variant="ghost" @click="deleteTarget = null">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
