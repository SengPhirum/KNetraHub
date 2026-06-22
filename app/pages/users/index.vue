<script setup lang="ts">
const { user: me } = useAuth()
const { relative } = useFormat()
const toast = useToast()

const { data, status, error, refreshing, refresh } = useApiCache('users', () => $fetch<any[]>('/api/users'))
onMounted(refresh)
const userSortOptions = [
  { label: 'Display name', value: 'displayName' },
  { label: 'Username', value: 'username' },
  { label: 'Email', value: 'email' },
  { label: 'Role', value: 'role' },
  { label: 'Source', value: 'source' },
  { label: 'Created', value: 'createdAt' },
  { label: 'Last login', value: 'lastLogin' }
]
const userFilterOptions = [
  { key: 'role', label: 'Role', getValue: (u: any) => u.role },
  { key: 'source', label: 'Source', getValue: (u: any) => u.source }
]
const { items: filtered, search, sortBy, sortDir, sortOptions, filters, facets } = useListControls('users', data, {
  sortOptions: userSortOptions,
  defaultSortBy: 'displayName',
  filterOptions: userFilterOptions
})

const ROLES = ['viewer', 'operator', 'admin'] as const
type Role = typeof ROLES[number]

const ROLE_META: Record<Role, { icon: string; color: string; bg: string; description: string; can: string[] }> = {
  viewer: {
    icon: 'i-lucide-eye',
    color: 'text-(--color-muted)',
    bg: 'bg-surface-2 text-(--color-muted)',
    description: 'Read-only access to all resources',
    can: ['View services, stacks, containers', 'Browse nodes, networks, volumes', 'Read logs and task history']
  },
  operator: {
    icon: 'i-lucide-wrench',
    color: 'text-sky-300',
    bg: 'bg-sky-500/10 text-sky-300',
    description: 'Manage workloads; cannot touch users or settings',
    can: ['Everything viewers can do', 'Scale & redeploy services', 'Deploy and remove stacks', 'Create / delete networks, volumes']
  },
  admin: {
    icon: 'i-lucide-shield-check',
    color: 'text-beacon',
    bg: 'bg-beacon/10 text-beacon',
    description: 'Full control including users and registries',
    can: ['Everything operators can do', 'Manage user accounts and roles', 'Configure Docker registries', 'View audit log']
  }
}

const open = ref(false)
const form = reactive({ username: '', displayName: '', email: '', role: 'viewer' as Role, password: '' })
function openCreate() { Object.assign(form, { username: '', displayName: '', email: '', role: 'viewer', password: '' }); open.value = true }
async function create() {
  if (!form.username || !form.password) { toast.add({ title: 'Username and password required', color: 'warning' }); return }
  try {
    const newUser = await $fetch<any>('/api/users', { method: 'POST', body: { ...form } })
    // Optimistic add
    data.value = [...(data.value ?? []), newUser]
    toast.add({ title: `Created ${form.username}`, color: 'primary', icon: 'i-lucide-user-plus' })
    open.value = false
    refresh()
  } catch (e: any) { toast.add({ title: 'Create failed', description: e?.data?.statusMessage, color: 'error' }) }
}

const editOpen = ref(false)
const editTarget = ref<any>(null)
const editForm = reactive({ role: 'viewer' as Role, password: '' })
function openEdit(u: any) { editTarget.value = u; editForm.role = u.role; editForm.password = ''; editOpen.value = true }
async function saveEdit() {
  try {
    const body: any = { role: editForm.role }
    if (editForm.password) body.password = editForm.password
    await $fetch(`/api/users/${editTarget.value.id}`, { method: 'PATCH', body })
    // Optimistic update role in list
    data.value = (data.value ?? []).map((u) => u.id === editTarget.value.id ? { ...u, role: editForm.role } : u)
    toast.add({ title: `Updated ${editTarget.value.username}`, color: 'primary' })
    editOpen.value = false
  } catch (e: any) { toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' }) }
}

const deleteTarget = ref<any>(null)
async function confirmDelete() {
  if (!deleteTarget.value) return
  const saved = [...(data.value ?? [])]
  data.value = saved.filter((u) => u.id !== deleteTarget.value.id)
  try {
    await $fetch(`/api/users/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: `Deleted ${deleteTarget.value.username}`, color: 'primary' })
    deleteTarget.value = null
  } catch (e: any) {
    data.value = saved
    deleteTarget.value = null
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  }
}
</script>

<template>
  <div>
    <PageHeader title="Users" subtitle="Local accounts and LDAP-synced identities" icon="i-lucide-users">
      <template #actions>
        <ListControls
          inline
          v-model:search="search"
          v-model:sort-by="sortBy"
          v-model:sort-dir="sortDir"
          v-model:filters="filters"
          :sort-options="sortOptions"
          :facets="facets"
          placeholder="Search users"
        />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton icon="i-lucide-user-plus" color="primary" label="Add user" @click="openCreate" />
      </template>
    </PageHeader>

    <!-- Role legend -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
      <div v-for="(meta, role) in ROLE_META" :key="role" class="panel-flush p-3.5 flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <UIcon :name="meta.icon" class="size-4 shrink-0" :class="meta.color" />
          <span class="font-medium capitalize text-sm text-foam">{{ role }}</span>
        </div>
        <p class="text-xs text-(--color-muted)">{{ meta.description }}</p>
        <ul class="text-xs text-faint space-y-0.5 mt-auto">
          <li v-for="c in meta.can" :key="c" class="flex items-start gap-1.5">
            <UIcon name="i-lucide-check" class="size-3 mt-0.5 shrink-0 text-running" />{{ c }}
          </li>
        </ul>
      </div>
    </div>

    <DataState :status="status" :error="error" :empty="!filtered.length" :refreshing="refreshing" empty-label="No users yet." empty-icon="i-lucide-users">
      <TransitionGroup name="list" tag="div" class="space-y-2">
        <div v-for="u in filtered" :key="u.id"
          class="panel-flush p-3.5 grid grid-cols-2 gap-3 sm:grid-cols-12 sm:items-center transition-colors hover:border-hull">
          <div class="col-span-2 sm:col-span-4 min-w-0">
            <div class="flex items-center gap-2.5">
              <span class="flex size-9 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-(--color-muted) ring-1 ring-hull shrink-0">
                {{ (u.displayName || u.username || '?').slice(0, 2).toUpperCase() }}
              </span>
              <div class="min-w-0">
                <p class="truncate font-medium text-foam">{{ u.displayName || u.username || '—' }}</p>
                <p class="truncate font-mono text-xs text-faint">{{ u.username || '—' }}</p>
              </div>
            </div>
          </div>
          <div class="sm:col-span-3 min-w-0 text-xs text-(--color-muted) truncate">{{ u.email || '—' }}</div>
          <div class="sm:col-span-2">
            <span class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium capitalize" :class="ROLE_META[u.role as Role]?.bg || 'bg-surface-2 text-(--color-muted)'">
              <UIcon :name="ROLE_META[u.role as Role]?.icon || 'i-lucide-user'" class="size-3" />
              {{ u.role || '—' }}
            </span>
          </div>
          <div class="sm:col-span-2 text-xs text-faint flex flex-wrap items-center gap-1.5">
            <span v-if="u.source" class="rounded bg-surface-2 px-1.5 py-0.5 uppercase">{{ u.source }}</span>
            <span>{{ u.lastLogin ? relative(u.lastLogin) : 'never' }}</span>
          </div>
          <div class="col-span-2 sm:col-span-1 flex justify-end gap-1">
            <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEdit(u)" />
            <UButton v-if="u.username !== me?.username" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" @click="deleteTarget = u" />
          </div>
        </div>
      </TransitionGroup>
    </DataState>

    <!-- Create modal -->
    <UModal v-model:open="open" title="Add local user">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Username" required><UInput v-model="form.username" class="w-full font-mono" /></UFormField>
          <UFormField label="Display name"><UInput v-model="form.displayName" class="w-full" /></UFormField>
          <UFormField label="Email"><UInput v-model="form.email" type="email" class="w-full" /></UFormField>
          <UFormField label="Role">
            <USelect v-model="form.role" :items="ROLES" class="w-full" />
            <template #hint><p class="text-xs text-faint mt-1">{{ ROLE_META[form.role]?.description }}</p></template>
          </UFormField>
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

    <!-- Edit modal -->
    <UModal v-model:open="editOpen" :title="`Edit ${editTarget?.username}`">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Role">
            <USelect v-model="editForm.role" :items="ROLES" class="w-full" />
            <template #hint><p class="text-xs text-faint mt-1">{{ ROLE_META[editForm.role]?.description }}</p></template>
          </UFormField>
          <UFormField v-if="editTarget?.source === 'local'" label="New password" hint="Leave blank to keep current">
            <UInput v-model="editForm.password" type="password" class="w-full" />
          </UFormField>
          <p v-else class="text-xs text-faint">{{ (editTarget?.source || 'external').toUpperCase() }} user — password is managed by your identity provider.</p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="editOpen = false" />
          <UButton color="primary" label="Save changes" icon="i-lucide-check" @click="saveEdit" />
        </div>
      </template>
    </UModal>

    <!-- Delete confirm modal -->
    <UModal :open="!!deleteTarget" @update:open="deleteTarget = null" title="Delete user?">
      <template #body>
        <p class="text-sm text-(--color-muted)">
          Are you sure you want to delete
          <span class="font-mono text-foam">{{ deleteTarget?.username }}</span>?
          This action cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="deleteTarget = null" />
          <UButton color="error" label="Delete" icon="i-lucide-trash-2" @click="confirmDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
