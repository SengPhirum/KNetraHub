<script setup lang="ts">
// Sections: phpIPAM-style tenant/zone grouping. Flat table rendered as a tree
// (indented by parent depth), with create/edit/delete.
const { hasApp } = useAuth()
const { canCreate, canUpdate, canDelete } = useIpam()
const toast = useToast()

const { data: sections, status, error, refresh } = useAsyncData('ipamSections',
  () => $fetch<any[]>('/api/ipmgt/sections'), { server: false, default: () => [] })

// Order sections as a tree: roots first, children nested under their parent.
const ordered = computed(() => {
  const list = sections.value || []
  const byParent = new Map<string | null, any[]>()
  for (const s of list) {
    const key = s.parent_id || null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(s)
  }
  const out: any[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const s of byParent.get(parent) || []) {
      out.push({ ...s, depth })
      walk(s.id, depth + 1)
    }
  }
  walk(null, 0)
  // Orphans (parent no longer present) fall back to root level.
  const seen = new Set(out.map((s) => s.id))
  for (const s of list) if (!seen.has(s.id)) out.push({ ...s, depth: 0 })
  return out
})

const parentItems = computed(() => [
  { value: '', label: '— None (root) —' },
  ...(sections.value || []).map((s: any) => ({ value: s.id, label: s.name }))
])

const dialog = reactive({ open: false, editing: null as any })
const form = reactive({ name: '', description: '', parent_id: '', strict_mode: false, display_order: 0, active: true })
const saving = ref(false)
const cfRef = ref()

function openCreate() {
  dialog.editing = null
  Object.assign(form, { name: '', description: '', parent_id: '', strict_mode: false, display_order: 0, active: true })
  dialog.open = true
}
function openEdit(s: any) {
  dialog.editing = s
  Object.assign(form, {
    name: s.name, description: s.description || '', parent_id: s.parent_id || '',
    strict_mode: !!s.strict_mode, display_order: s.display_order || 0, active: !!s.active
  })
  dialog.open = true
}
async function save() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    const body = { ...form, parent_id: form.parent_id || null }
    let id = dialog.editing?.id
    if (dialog.editing) await $fetch(`/api/ipmgt/sections/${dialog.editing.id}`, { method: 'PUT', body })
    else { const res: any = await $fetch('/api/ipmgt/sections', { method: 'POST', body }); id = res.id }
    await cfRef.value?.saveValues(id)
    toast.add({ title: dialog.editing ? 'Section updated' : 'Section created', color: 'primary', icon: 'i-lucide-check' })
    dialog.open = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

const deleteTarget = ref<any>(null)
async function confirmDelete(password: string) {
  if (!deleteTarget.value) return
  const force = !!deleteTarget.value.subnet_count
  await $fetch(`/api/ipmgt/sections/${deleteTarget.value.id}${force ? '?force=true' : ''}`, { method: 'DELETE', headers: { 'x-confirm-password': password } })
  toast.add({ title: 'Section deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}
</script>

<template>
  <div>
    <PageHeader title="Sections" subtitle="Tenants, zones and network groups" icon="i-lucide-folder-tree">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add section</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <DataState v-else :status="status" :error="error" :empty="!ordered.length"
               empty-label="No sections yet. Add one to group your subnets." empty-icon="i-lucide-folder-plus">
      <template #empty-action>
        <UButton v-if="canCreate" class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add section</UButton>
      </template>
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-2 text-xs uppercase text-faint">
            <tr>
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-4 py-3 font-medium">Description</th>
              <th class="px-4 py-3 font-medium">Subnets</th>
              <th class="px-4 py-3 font-medium">Strict</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="s in ordered" :key="s.id" class="hover:bg-surface-2/40">
              <td class="px-4 py-3">
                <NuxtLink :to="`/ipmgt/subnets?section_id=${s.id}`" class="font-medium text-foam hover:text-beacon"
                          :style="{ paddingLeft: `${s.depth * 18}px` }">
                  <UIcon :name="s.depth ? 'i-lucide-corner-down-right' : 'i-lucide-folder'" class="mr-1 inline size-3.5 text-faint" />
                  {{ s.name }}
                </NuxtLink>
              </td>
              <td class="px-4 py-3 text-(--color-muted)">{{ s.description || '—' }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ s.subnet_count }}</td>
              <td class="px-4 py-3">
                <UIcon v-if="s.strict_mode" name="i-lucide-shield-check" class="size-4 text-amber-400" />
                <span v-else class="text-faint">—</span>
              </td>
              <td class="px-4 py-3">
                <span class="text-xs" :class="s.active ? 'text-emerald-400' : 'text-faint'">{{ s.active ? 'Active' : 'Inactive' }}</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <UButton v-if="canUpdate" size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(s)" />
                  <UButton v-if="canDelete" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = s" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="dialog.open" :title="dialog.editing ? 'Edit section' : 'Add section'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="form.name" placeholder="Data Center" class="w-full" autofocus @keyup.enter="save" />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="form.description" class="w-full" :rows="2" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Parent section">
              <USelect v-model="form.parent_id" :items="parentItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="Display order">
              <UInput v-model.number="form.display_order" type="number" class="w-full" />
            </UFormField>
          </div>
          <div class="flex items-center gap-6">
            <UCheckbox v-model="form.strict_mode" label="Strict mode" />
            <UCheckbox v-model="form.active" label="Active" />
          </div>
          <IpamCustomFieldsPanel ref="cfRef" entity-type="section" :entity-id="dialog.editing?.id || null" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" @click="dialog.open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" :disabled="!form.name.trim()" @click="save">{{ dialog.editing ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </UModal>

    <ConfirmPasswordModal
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete section"
      :message="deleteTarget?.subnet_count
        ? `${deleteTarget.name} still holds ${deleteTarget.subnet_count} subnet(s) - force delete detaches them (they are not removed).`
        : (deleteTarget ? `${deleteTarget.name} will be permanently removed.` : '')"
      :confirm-label="deleteTarget?.subnet_count ? 'Force delete' : 'Delete'"
      :action="confirmDelete"
    />
  </div>
</template>
