<script setup lang="ts">
// Zabbix host groups: CRUD. Membership is edited from the host form (a host
// picks its groups), so this page manages the groups themselves + shows counts.
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const { data: groups, status, refresh } = useAsyncData('serverHostGroups', () => $fetch<any[]>('/api/server/hostgroups'), { default: () => [] })

const open = ref(false)
const editing = ref<any>(null)
const form = reactive({ name: '', description: '' })
const saving = ref(false)

function openCreate() {
  editing.value = null
  form.name = ''
  form.description = ''
  open.value = true
}
function openEdit(g: any) {
  editing.value = g
  form.name = g.name
  form.description = g.description || ''
  open.value = true
}
async function save() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    if (editing.value) await $fetch(`/api/server/hostgroups/${editing.value.id}`, { method: 'PUT', body: { ...form } })
    else await $fetch('/api/server/hostgroups', { method: 'POST', body: { ...form } })
    toast.add({ title: editing.value ? 'Group updated' : 'Group created', color: 'primary', icon: 'i-lucide-check' })
    open.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}

const deleteTarget = ref<any>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  try {
    await $fetch(`/api/server/hostgroups/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Group deleted', color: 'primary', icon: 'i-lucide-check' })
    deleteTarget.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  }
}
</script>

<template>
  <div>
    <PageHeader title="Host groups" subtitle="Organize monitored hosts into groups" icon="i-lucide-folder-tree">
      <template v-if="hasApp('monitoring') && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Create group</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else class="panel">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm text-(--color-muted)">
          <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
            <tr>
              <th class="px-4 py-3 font-medium">Group</th>
              <th class="px-4 py-3 font-medium">Description</th>
              <th class="px-4 py-3 font-medium">Hosts</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-if="status === 'pending' && !groups.length"><td colspan="4" class="px-4 py-8 text-center text-faint">Loading…</td></tr>
            <tr v-else-if="!groups.length"><td colspan="4" class="px-4 py-8 text-center text-faint">No host groups yet.</td></tr>
            <tr v-for="g in groups" :key="g.id" class="hover:bg-surface-2/50 transition">
              <td class="px-4 py-3 font-medium text-foam">{{ g.name }}</td>
              <td class="px-4 py-3">{{ g.description || '—' }}</td>
              <td class="px-4 py-3"><UBadge color="neutral" variant="subtle" size="xs">{{ g.host_count }}</UBadge></td>
              <td class="px-4 py-3 text-right">
                <div v-if="canManage" class="flex justify-end gap-1">
                  <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(g)" />
                  <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = g" />
                </div>
                <span v-else class="text-faint text-xs">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="open" :title="editing ? 'Edit host group' : 'Create host group'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="form.name" class="w-full" placeholder="e.g. Linux servers" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="form.description" class="w-full" :rows="2" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" @click="save">{{ editing ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleteTarget" title="Delete host group" @update:open="(v: boolean) => { if (!v) deleteTarget = null }">
      <template #body>
        <p class="text-sm text-(--color-muted)">Delete <span class="font-medium text-foam">{{ deleteTarget?.name }}</span>? Hosts stay, but lose this grouping.</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="deleteTarget = null">Cancel</UButton>
          <UButton color="error" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
