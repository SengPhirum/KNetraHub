<script setup lang="ts">
// Work administration: task types, custom fields, and the member roster.
// Gated by work.settings in nav; the APIs re-enforce per action.
const { canSettings, canDelete } = useWork()
const toast = useToast()

const { data: types, refresh: refreshTypes } = useAsyncData('workTaskTypesAdmin',
  () => $fetch<any[]>('/api/work/v1/task-types'), { server: false, default: () => [] })
const { data: fields, status: fieldsStatus, error: fieldsError, refresh: refreshFields } = useAsyncData('workFieldsAdmin',
  () => $fetch<any[]>('/api/work/v1/custom-fields'), { server: false, default: () => [] })
const { data: members, status: membersStatus, error: membersError } = useAsyncData('workMembersAdmin',
  () => $fetch<any[]>('/api/work/v1/members'), { server: false, default: () => [] })
const { data: spaces } = useAsyncData('workSpaces',
  () => $fetch<any[]>('/api/work/v1/spaces'), { server: false, default: () => [] })

function fail(e: any, what: string) {
  toast.add({ title: `Could not ${what}`, description: e?.data?.statusMessage || e?.message, color: 'error' })
}

// Task types
const newType = reactive({ name: '', icon: 'i-lucide-circle-check' })
async function addType() {
  if (!newType.name.trim()) return
  try {
    await $fetch('/api/work/v1/task-types', { method: 'POST', body: { ...newType } })
    Object.assign(newType, { name: '', icon: 'i-lucide-circle-check' })
    await refreshTypes()
  } catch (e: any) { fail(e, 'create task type') }
}
async function removeType(t: any) {
  if (!confirm(`Delete task type "${t.name}"? Tasks using it become untyped.`)) return
  try {
    await $fetch(`/api/work/v1/task-types/${t.id}`, { method: 'DELETE' })
    await refreshTypes()
  } catch (e: any) { fail(e, 'delete task type') }
}

// Custom fields
const showFieldModal = ref(false)
const savingField = ref(false)
const fieldForm = reactive({
  name: '', field_type: 'text', scope_type: 'workspace', scope_id: '',
  required: false, options_text: ''
})
const fieldTypeItems = [
  'text', 'textarea', 'number', 'currency', 'date', 'datetime', 'checkbox',
  'dropdown', 'labels', 'email', 'phone', 'url', 'people', 'rating', 'progress'
].map((t) => ({ label: t, value: t }))
const scopeItems = computed(() => [
  { label: 'Workspace (all tasks)', value: 'workspace' },
  ...(spaces.value || []).map((s: any) => ({ label: `Space: ${s.name}`, value: `space:${s.id}` }))
])
const fieldScope = ref('workspace')
async function saveField() {
  savingField.value = true
  try {
    const [scopeType, scopeId] = fieldScope.value === 'workspace' ? ['workspace', ''] : fieldScope.value.split(':')
    await $fetch('/api/work/v1/custom-fields', {
      method: 'POST',
      body: {
        name: fieldForm.name,
        field_type: fieldForm.field_type,
        scope_type: scopeType,
        scope_id: scopeId || undefined,
        required: fieldForm.required,
        options: ['dropdown', 'labels'].includes(fieldForm.field_type)
          ? fieldForm.options_text.split('\n').map((l) => l.trim()).filter(Boolean).map((label) => ({ label }))
          : undefined
      }
    })
    showFieldModal.value = false
    Object.assign(fieldForm, { name: '', field_type: 'text', required: false, options_text: '' })
    await refreshFields()
  } catch (e: any) { fail(e, 'create field') } finally { savingField.value = false }
}
async function archiveField(field: any, archived: boolean) {
  try {
    await $fetch(`/api/work/v1/custom-fields/${field.id}`, { method: 'PATCH', body: { archived, version: field.version } })
    await refreshFields()
  } catch (e: any) { fail(e, 'update field') }
}
async function removeField(field: any) {
  if (!confirm(`Permanently delete field "${field.name}" and all stored values?`)) return
  try {
    await $fetch(`/api/work/v1/custom-fields/${field.id}`, { method: 'DELETE' })
    await refreshFields()
  } catch (e: any) { fail(e, 'delete field') }
}
</script>

<template>
  <div>
    <PageHeader title="Work settings" subtitle="Task types, custom fields, and members" icon="i-lucide-settings" />

    <div class="grid gap-4 lg:grid-cols-2">
      <!-- Task types -->
      <div class="panel p-4">
        <p class="mb-3 text-sm font-semibold text-foam">Task types</p>
        <div class="space-y-1.5">
          <div v-for="t in types" :key="t.id" class="flex items-center gap-2 rounded-lg bg-surface/60 px-3 py-2 ring-1 ring-hull">
            <UIcon :name="t.icon" class="size-4 text-beacon" />
            <span class="flex-1 text-sm text-foam">{{ t.name }}</span>
            <span v-if="t.is_default" class="rounded bg-surface px-1.5 text-[10px] text-faint ring-1 ring-hull">default</span>
            <UButton v-if="canSettings && !t.is_default" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="removeType(t)" />
          </div>
        </div>
        <div v-if="canSettings" class="mt-3 flex gap-2">
          <UInput v-model="newType.name" size="sm" class="flex-1" placeholder="New type (e.g. Incident)…" @keydown.enter="addType" />
          <UInput v-model="newType.icon" size="sm" class="w-44" placeholder="i-lucide-…" />
          <UButton size="sm" variant="soft" icon="i-lucide-plus" @click="addType" />
        </div>
      </div>

      <!-- Members -->
      <div class="panel p-4">
        <p class="mb-3 text-sm font-semibold text-foam">Members</p>
        <p class="mb-2 text-xs text-faint">
          Users appear here automatically on their first sign-in to Work; their tier comes from
          Admin → App &amp; Access. Private-space sharing is managed inside each space.
        </p>
        <DataState :status="membersStatus" :error="membersError" :empty="!members?.length" empty-label="No members yet.">
          <div class="max-h-80 space-y-1 overflow-y-auto">
            <div v-for="m in members" :key="m.username" class="flex items-center gap-2 rounded px-2 py-1.5 text-sm">
              <span class="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white" :style="{ backgroundColor: userColor(m.username) }">{{ userInitials(m.username) }}</span>
              <span class="flex-1 truncate text-(--color-muted)">{{ m.display_name || m.username }}</span>
              <span class="rounded bg-surface px-1.5 py-0.5 text-[10px] text-faint ring-1 ring-hull">{{ m.tier }}</span>
              <span class="text-xs text-faint">seen {{ workShortDate(m.last_seen_at) }}</span>
            </div>
          </div>
        </DataState>
      </div>

      <!-- Custom fields -->
      <div class="panel p-4 lg:col-span-2">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-sm font-semibold text-foam">Custom fields</p>
          <UButton v-if="canSettings" size="xs" icon="i-lucide-plus" @click="showFieldModal = true">New field</UButton>
        </div>
        <DataState :status="fieldsStatus" :error="fieldsError" :empty="!fields?.length" empty-label="No custom fields defined.">
          <div class="overflow-x-auto">
            <table class="w-full min-w-150 text-sm">
              <thead>
                <tr class="border-b border-hull text-left text-xs uppercase tracking-wide text-faint">
                  <th class="px-3 py-2">Name</th>
                  <th class="px-3 py-2">Type</th>
                  <th class="px-3 py-2">Scope</th>
                  <th class="px-3 py-2">Required</th>
                  <th class="px-3 py-2">Options</th>
                  <th class="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in fields" :key="f.id" class="border-b border-hull/50" :class="f.archived_at ? 'opacity-50' : ''">
                  <td class="px-3 py-2 text-foam">{{ f.name }}</td>
                  <td class="px-3 py-2 font-mono text-xs text-(--color-muted)">{{ f.field_type }}</td>
                  <td class="px-3 py-2 text-xs text-faint">{{ f.scope_type }}</td>
                  <td class="px-3 py-2 text-xs">{{ f.required ? 'yes' : '—' }}</td>
                  <td class="px-3 py-2 text-xs text-faint">{{ (f.options || []).map((o: any) => o.label).join(', ') || '—' }}</td>
                  <td class="px-3 py-2 text-right">
                    <UButton v-if="canSettings" size="xs" variant="ghost" color="neutral" :icon="f.archived_at ? 'i-lucide-archive-restore' : 'i-lucide-archive'" :title="f.archived_at ? 'Restore' : 'Archive'" @click="archiveField(f, !f.archived_at)" />
                    <UButton v-if="canDelete" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="removeField(f)" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </DataState>
      </div>
    </div>

    <UModal v-model:open="showFieldModal" title="New custom field">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="fieldForm.name" class="w-full" /></UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Type"><USelect v-model="fieldForm.field_type" :items="fieldTypeItems" value-key="value" class="w-full" /></UFormField>
            <UFormField label="Scope"><USelect v-model="fieldScope" :items="scopeItems" value-key="value" class="w-full" /></UFormField>
          </div>
          <UFormField v-if="['dropdown', 'labels'].includes(fieldForm.field_type)" label="Options" hint="one per line">
            <UTextarea v-model="fieldForm.options_text" :rows="4" class="w-full" placeholder="Option A&#10;Option B" />
          </UFormField>
          <UCheckbox v-model="fieldForm.required" label="Required" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showFieldModal = false">Cancel</UButton>
          <UButton :loading="savingField" :disabled="!fieldForm.name" @click="saveField">Create field</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
