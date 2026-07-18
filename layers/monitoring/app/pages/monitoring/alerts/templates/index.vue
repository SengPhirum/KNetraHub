<script setup lang="ts">
// Alert templates — full CRUD (admin tier). Templates use safe {{ path }}
// interpolation only (no code execution); the default template applies to
// rules without an explicit binding.
const { hasMonitoring, canManage } = useMonitoring()
const toast = useToast()

const { data, status, refresh } = useAsyncData('monTemplates',
  () => $fetch<any>('/api/monitoring/v1/alerts/templates'),
  { server: false, default: () => ({ items: [] }) })

const form = reactive({ name: '', title_template: '', body_template: '', is_default: false })
const editingId = ref<number | null>(null)
const modalOpen = ref(false)
const saving = ref(false)

function openCreate() {
  editingId.value = null
  Object.assign(form, {
    name: '',
    title_template: '[{{ alert.severity }}] {{ rule.name }} — {{ device.hostname }}',
    body_template: 'Rule {{ rule.name }} is {{ alert.state }} on {{ device.hostname }} ({{ device.ip }}).\nOpened: {{ alert.opened_at }}',
    is_default: false
  })
  modalOpen.value = true
}
function openEdit(t: any) {
  editingId.value = t.id
  Object.assign(form, {
    name: t.name, title_template: t.title_template, body_template: t.body_template, is_default: !!t.is_default
  })
  modalOpen.value = true
}

async function save() {
  saving.value = true
  try {
    if (editingId.value) {
      await $fetch(`/api/monitoring/v1/alerts/templates/${editingId.value}`, { method: 'PUT', body: { ...form } })
      toast.add({ title: 'Template updated', color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch('/api/monitoring/v1/alerts/templates', { method: 'POST', body: { ...form } })
      toast.add({ title: 'Template created', color: 'primary', icon: 'i-lucide-check' })
    }
    modalOpen.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

const deleteTarget = ref<any>(null)
const deleting = ref(false)
async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await $fetch(`/api/monitoring/v1/alerts/templates/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Template deleted', color: 'primary', icon: 'i-lucide-check' })
    deleteTarget.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { deleting.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="Alert Templates" subtitle="Notification rendering (safe interpolation)" icon="i-lucide-layout-template">
      <template v-if="hasMonitoring && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add template</UButton>
      </template>
    </PageHeader>
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="space-y-4">
      <div v-if="status === 'pending'" class="panel p-8 text-center text-muted">Loading…</div>
      <div v-else-if="!data.items?.length" class="panel p-8 text-center text-muted">No templates — notifications use the built-in format.</div>
      <div v-for="t in data.items" :key="t.id" class="panel p-4">
        <div class="mb-2 flex items-center gap-2">
          <h3 class="font-semibold">{{ t.name }}</h3>
          <span v-if="t.is_default" class="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">default</span>
          <div v-if="canManage" class="ml-auto flex gap-1">
            <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="openEdit(t)" />
            <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteTarget = t" />
          </div>
        </div>
        <div class="mb-1 text-xs uppercase text-faint">Title</div>
        <pre class="mb-3 overflow-x-auto rounded bg-surface-2 p-2 text-xs">{{ t.title_template }}</pre>
        <div class="mb-1 text-xs uppercase text-faint">Body</div>
        <pre class="overflow-x-auto rounded bg-surface-2 p-2 text-xs">{{ t.body_template }}</pre>
      </div>
    </div>

    <UModal v-model:open="modalOpen" :title="editingId ? 'Edit template' : 'Add template'" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" placeholder="Default incident format" class="w-full" /></UFormField>
          <UFormField label="Title template" required description="Safe placeholders like {{ rule.name }}, {{ device.hostname }}, {{ alert.severity }} — no code execution">
            <UInput v-model="form.title_template" class="w-full font-mono" />
          </UFormField>
          <UFormField label="Body template" required>
            <UTextarea v-model="form.body_template" :rows="6" class="w-full font-mono" />
          </UFormField>
          <UCheckbox v-model="form.is_default" label="Use as the default template for rules without one" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalOpen = false">Cancel</UButton>
          <UButton :loading="saving" :disabled="!form.name || !form.title_template || !form.body_template" @click="save">
            {{ editingId ? 'Save' : 'Add template' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleteTarget" title="Delete template" @update:open="(v) => !v && (deleteTarget = null)">
      <template #body>
        <p class="text-sm text-muted">
          Delete <strong>{{ deleteTarget?.name }}</strong>? Rules bound to it fall back to the default format.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="deleteTarget = null">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
