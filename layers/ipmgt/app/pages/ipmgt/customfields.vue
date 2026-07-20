<script setup lang="ts">
// Custom field definitions: admin-only configuration of extra fields on any
// IPAM entity type. Values are entered on each entity's own form (see
// IpamCustomFieldsPanel), rendered automatically once a definition exists.
definePageMeta({
  middleware: [(to) => {
    const { hasPermission } = useAuth()
    if (!hasPermission('ipmgt.settings')) return navigateTo('/ipmgt')
  }]
})
const { hasApp } = useAuth()
const toast = useToast()

const ENTITY_TYPE_ITEMS = [
  { value: 'subnet', label: 'Subnet' }, { value: 'address', label: 'IP Address' },
  { value: 'device', label: 'Device' }, { value: 'location', label: 'Location' },
  { value: 'customer', label: 'Customer' }, { value: 'vlan', label: 'VLAN' },
  { value: 'vrf', label: 'VRF' }, { value: 'section', label: 'Section' }
]
const FIELD_TYPE_ITEMS = [
  { value: 'text', label: 'Short text' }, { value: 'textarea', label: 'Long text' },
  { value: 'integer', label: 'Integer' }, { value: 'decimal', label: 'Decimal' },
  { value: 'boolean', label: 'Boolean' }, { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date & time' },
  { value: 'select', label: 'Single select' }, { value: 'multiselect', label: 'Multi-select' },
  { value: 'url', label: 'URL' }, { value: 'email', label: 'Email' },
  { value: 'ip', label: 'IP address' }, { value: 'cidr', label: 'CIDR' }, { value: 'mac', label: 'MAC address' },
  { value: 'location_ref', label: 'Location reference' }, { value: 'device_ref', label: 'Device reference' },
  { value: 'customer_ref', label: 'Customer reference' }
]
const entityLabel = (v: string) => ENTITY_TYPE_ITEMS.find((e) => e.value === v)?.label || v
const fieldTypeLabel = (v: string) => FIELD_TYPE_ITEMS.find((f) => f.value === v)?.label || v

const { data: defs, status, error, refresh } = useAsyncData('ipamCustomFieldDefs', () => $fetch<any[]>('/api/ipmgt/customfields/defs'), { server: false, default: () => [] })

const emptyForm = () => ({
  entity_type: 'subnet', field_key: '', label: '', field_type: 'text',
  optionsText: '', default_value: '', required: false, unique_value: false, searchable: false,
  visible_list: true, visible_detail: true, visible_export: true, display_order: 0, active: true
})
const dialog = reactive({ open: false, editing: null as any })
const form = reactive(emptyForm())
const saving = ref(false)
const needsOptions = computed(() => ['select', 'multiselect'].includes(form.field_type))

function openCreate() { dialog.editing = null; Object.assign(form, emptyForm()); dialog.open = true }
function openEdit(d: any) {
  dialog.editing = d
  let opts: string[] = []
  try { opts = d.options ? JSON.parse(d.options) : [] } catch { opts = [] }
  Object.assign(form, {
    entity_type: d.entity_type, field_key: d.field_key, label: d.label, field_type: d.field_type,
    optionsText: opts.join('\n'), default_value: d.default_value || '',
    required: !!d.required, unique_value: !!d.unique_value, searchable: !!d.searchable,
    visible_list: !!d.visible_list, visible_detail: !!d.visible_detail, visible_export: !!d.visible_export,
    display_order: d.display_order || 0, active: !!d.active
  })
  dialog.open = true
}
async function save() {
  if (!form.label.trim() || (!dialog.editing && !form.field_key.trim())) return
  saving.value = true
  try {
    const options = needsOptions.value ? form.optionsText.split('\n').map((s) => s.trim()).filter(Boolean) : undefined
    const body: any = { ...form, options }
    if (dialog.editing) await $fetch(`/api/ipmgt/customfields/defs/${dialog.editing.id}`, { method: 'PUT', body })
    else await $fetch('/api/ipmgt/customfields/defs', { method: 'POST', body })
    toast.add({ title: dialog.editing ? 'Field updated' : 'Field created', color: 'primary', icon: 'i-lucide-check' })
    dialog.open = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}

const deleteTarget = ref<any | null>(null)
async function confirmDelete(headers: Record<string, string>) {
  const d = deleteTarget.value
  if (!d) return
  await $fetch(`/api/ipmgt/customfields/defs/${d.id}`, { method: 'DELETE', headers })
  toast.add({ title: 'Field deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}
</script>

<template>
  <div>
    <PageHeader title="Custom Fields" subtitle="Admin-defined extra fields for IPAM entities" icon="i-lucide-list-plus">
      <template v-if="hasApp('ipmgt')" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add field</UButton>
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!defs.length" empty-label="No custom fields defined yet." empty-icon="i-lucide-list-plus">
      <template #empty-action>
        <UButton class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add field</UButton>
      </template>
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-2 text-xs uppercase text-faint">
            <tr>
              <th class="px-4 py-3 font-medium">Entity</th>
              <th class="px-4 py-3 font-medium">Key</th>
              <th class="px-4 py-3 font-medium">Label</th>
              <th class="px-4 py-3 font-medium">Type</th>
              <th class="px-4 py-3 font-medium">Flags</th>
              <th class="px-4 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="d in defs" :key="d.id" class="hover:bg-surface-2/40">
              <td class="px-4 py-3 text-(--color-muted)">{{ entityLabel(d.entity_type) }}</td>
              <td class="px-4 py-3 font-mono text-xs text-foam">{{ d.field_key }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ d.label }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ fieldTypeLabel(d.field_type) }}</td>
              <td class="px-4 py-3 text-xs text-faint">
                <span v-if="d.required" class="mr-2">Required</span>
                <span v-if="d.unique_value" class="mr-2">Unique</span>
                <span v-if="d.searchable">Searchable</span>
              </td>
              <td class="px-4 py-3"><span class="text-xs" :class="d.active ? 'text-emerald-400' : 'text-faint'">{{ d.active ? 'Active' : 'Inactive' }}</span></td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <UButton size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(d)" />
                  <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = d" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="dialog.open" :title="dialog.editing ? 'Edit custom field' : 'Add custom field'" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Entity type" required>
              <USelect v-model="form.entity_type" :items="ENTITY_TYPE_ITEMS" value-key="value" label-key="label" class="w-full" :disabled="!!dialog.editing" />
            </UFormField>
            <UFormField label="Field type" required>
              <USelect v-model="form.field_type" :items="FIELD_TYPE_ITEMS" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Field key" required help="Stable machine id, e.g. asset_tag">
              <UInput v-model="form.field_key" placeholder="asset_tag" class="w-full font-mono" :disabled="!!dialog.editing" />
            </UFormField>
            <UFormField label="Label" required>
              <UInput v-model="form.label" placeholder="Asset Tag" class="w-full" />
            </UFormField>
          </div>
          <UFormField v-if="needsOptions" label="Options" required help="One option per line">
            <UTextarea v-model="form.optionsText" class="w-full font-mono" :rows="4" placeholder="Option A&#10;Option B" />
          </UFormField>
          <UFormField label="Default value">
            <UInput v-model="form.default_value" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Display order">
              <UInput v-model.number="form.display_order" type="number" class="w-full" />
            </UFormField>
          </div>
          <div class="flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-surface-2/40 p-3">
            <UCheckbox v-model="form.required" label="Required" />
            <UCheckbox v-model="form.unique_value" label="Unique" />
            <UCheckbox v-model="form.searchable" label="Searchable" />
            <UCheckbox v-model="form.visible_list" label="Visible in list" />
            <UCheckbox v-model="form.visible_detail" label="Visible in detail" />
            <UCheckbox v-model="form.visible_export" label="Visible in export" />
            <UCheckbox v-model="form.active" label="Active" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" @click="dialog.open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" @click="save">{{ dialog.editing ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </UModal>

    <ConfirmDeleteModal
      type="ipmgt.customfield"
      :item-name="deleteTarget?.label"
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete custom field"
      :message="deleteTarget ? `Field ${deleteTarget.label} and all its stored values will be permanently removed.` : ''"
      confirm-label="Delete"
      :action="confirmDelete"
    />
  </div>
</template>
