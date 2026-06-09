<script setup lang="ts">
const { user: me } = useAuth()
const { relative } = useFormat()
const toast = useToast()
const { data, status, error, refresh } = await useFetch('/api/users', { lazy: true })

const ROLES = ['viewer', 'operator', 'admin']

// create
const open = ref(false)
const form = reactive({ username: '', displayName: '', email: '', role: 'viewer', password: '' })
function openCreate() { Object.assign(form, { username: '', displayName: '', email: '', role: 'viewer', password: '' }); open.value = true }
async function create() {
  if (!form.username || !form.password) { toast.add({ title: 'Username and password required', color: 'warning' }); return }
  try {
    await $fetch('/api/users', { method: 'POST', body: { ...form } })
    toast.add({ title: `Created ${form.username}`, color: 'primary', icon: 'i-lucide-user-plus' })
    open.value = false
    setTimeout(refresh, 400)
  } catch (e: any) { toast.add({ title: 'Create failed', description: e?.data?.statusMessage, color: 'error' }) }
}

// edit
const editOpen = ref(false)
const editTarget = ref<any>(null)
const editForm = reactive({ role: 'viewer', password: '' })
function openEdit(u: any) { editTarget.value = u; editForm.role = u.role; editForm.password = ''; editOpen.value = true }
async function saveEdit() {
  try {
    const body: any = { role: editForm.role }
    if (editForm.password) body.password = editForm.password
    await $fetch(`/api/users/${editTarget.value.id}`, { method: 'PATCH', body })
    toast.add({ title: `Updated ${editTarget.value.username}`, color: 'primary' })
    editOpen.value = false
    setTimeout(refresh, 400)
  } catch (e: any) { toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' }) }
}

async function remove(u: any) {
  if (!confirm(`Delete user "${u.username}"?`)) return
  try {
    await $fetch(`/api/users/${u.id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${u.username}`, color: 'primary' })
    refresh()
  } catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' }) }
}

const roleColor: Record<string, string> = {
  admin: 'bg-[var(--color-beacon)]/10 text-[var(--color-beacon)]',
  operator: 'bg-sky-500/10 text-sky-300',
  viewer: 'bg-[var(--color-surface-2)] text-[var(--color-muted)]'
}
</script>

<template>
  <div>
    <PageHeader title="Users" subtitle="Local accounts and LDAP-synced identities" icon="i-lucide-users">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
        <UButton icon="i-lucide-user-plus" color="primary" label="Add user" @click="openCreate" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No users." empty-icon="i-lucide-users">
      <div class="space-y-2">
        <div v-for="u in data" :key="u.id" class="panel-flush p-3.5 grid grid-cols-2 gap-3 sm:grid-cols-12 sm:items-center">
          <div class="col-span-2 sm:col-span-4 min-w-0">
            <div class="flex items-center gap-2">
              <span class="flex size-8 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-xs font-semibold text-[var(--color-muted)]">{{ (u.displayName || u.username).slice(0, 2).toUpperCase() }}</span>
              <div class="min-w-0">
                <p class="truncate font-medium text-[var(--color-foam)]">{{ u.displayName || u.username }}</p>
                <p class="truncate font-mono text-xs text-[var(--color-faint)]">{{ u.username }}</p>
              </div>
            </div>
          </div>
          <div class="sm:col-span-3 min-w-0 text-xs text-[var(--color-muted)] truncate">{{ u.email || '—' }}</div>
          <div class="sm:col-span-2">
            <span class="rounded px-2 py-0.5 text-xs font-medium capitalize" :class="roleColor[u.role]">{{ u.role }}</span>
          </div>
          <div class="sm:col-span-2 text-xs text-[var(--color-faint)]">
            <span class="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5">{{ u.source }}</span>
            <span class="ml-1">{{ u.lastLogin ? relative(u.lastLogin) : 'never' }}</span>
          </div>
          <div class="col-span-2 sm:col-span-1 flex justify-end gap-1">
            <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEdit(u)" />
            <UButton v-if="u.username !== me?.username" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="remove(u)" />
          </div>
        </div>
      </div>
    </DataState>

    <!-- create -->
    <UModal v-model:open="open" title="Add local user">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Username" required><UInput v-model="form.username" class="w-full font-mono" /></UFormField>
          <UFormField label="Display name"><UInput v-model="form.displayName" class="w-full" /></UFormField>
          <UFormField label="Email"><UInput v-model="form.email" type="email" class="w-full" /></UFormField>
          <UFormField label="Role"><USelect v-model="form.role" :items="ROLES" class="w-full" /></UFormField>
          <UFormField label="Password" required><UInput v-model="form.password" type="password" class="w-full" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton color="primary" label="Create" icon="i-lucide-check" @click="create" />
        </div>
      </template>
    </UModal>

    <!-- edit -->
    <UModal v-model:open="editOpen" :title="`Edit ${editTarget?.username}`">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Role"><USelect v-model="editForm.role" :items="ROLES" class="w-full" /></UFormField>
          <UFormField v-if="editTarget?.source === 'local'" label="New password" hint="Leave blank to keep current"><UInput v-model="editForm.password" type="password" class="w-full" /></UFormField>
          <p v-else class="text-xs text-[var(--color-faint)]">LDAP user — password is managed by your directory.</p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="editOpen = false" />
          <UButton color="primary" label="Save" icon="i-lucide-check" @click="saveEdit" />
        </div>
      </template>
    </UModal>
  </div>
</template>
