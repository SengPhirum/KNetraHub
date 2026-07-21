<script setup lang="ts">
import { scopeLabel } from '~~/shared/utils/notifications'

// Admin ▸ Notifications ▸ Templates — reusable message wording (title + body)
// shared across apps. Rules reference a template instead of hard-coding text.
// Placeholders use {{name}} and render safely (unknown keys become empty).
definePageMeta({ middleware: 'admin' })

const toast = useToast()
const { data, status, error, refresh, refreshing } = useApiCache('notification-templates', () => $fetch<any[]>('/api/notifications/templates'))
onMounted(refresh)

const APPS = getModuleRegistry()
const scopeOptions = computed(() => [
  { label: 'Global (all apps)', value: 'global' },
  ...APPS.map((a) => ({ label: `${a.name} only`, value: a.key }))
])

// Common placeholders every message context provides.
const COMMON_VARS = ['title', 'message', 'severity', 'app', 'time']

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', scope: 'global', title: '', body: '' })
const saving = ref(false)

function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', scope: 'global', title: '[{{severity}}] {{title}}', body: '{{message}}\n\nSource: {{app}}\nWhen: {{time}}' })
  modalOpen.value = true
}
function openEdit(t: any) {
  editingId.value = t.id
  Object.assign(form, { name: t.name, scope: t.scope, title: t.title, body: t.body })
  modalOpen.value = true
}
function insertVar(v: string) { form.body += `{{${v}}}` }

async function save() {
  if (!form.name.trim()) { toast.add({ title: 'Give the template a name', color: 'warning' }); return }
  if (!form.title.trim()) { toast.add({ title: 'A title is required', color: 'warning' }); return }
  saving.value = true
  try {
    if (editingId.value) {
      await $fetch(`/api/notifications/templates/${editingId.value}`, { method: 'PATCH', body: { ...form } })
      toast.add({ title: `Updated ${form.name}`, color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch('/api/notifications/templates', { method: 'POST', body: { ...form } })
      toast.add({ title: `Created ${form.name}`, color: 'primary', icon: 'i-lucide-check' })
    }
    modalOpen.value = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}

const deleteTarget = ref<any>(null)
async function confirmDelete(headers: Record<string, string>) {
  const t = deleteTarget.value
  if (!t) return
  await $fetch(`/api/notifications/templates/${t.id}`, { method: 'DELETE', headers })
  toast.add({ title: `Deleted ${t.name}`, color: 'primary' })
  data.value = (data.value ?? []).filter((x) => x.id !== t.id)
  deleteTarget.value = null
}
</script>

<template>
  <div>
    <PageHeader title="Notification templates" subtitle="Reusable message wording shared across apps" icon="i-lucide-layout-template">
      <template #actions>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="refreshing" @click="refresh()" />
        <UButton icon="i-lucide-plus" color="primary" label="Add template" @click="openCreate" />
      </template>
    </PageHeader>

    <div class="notice-info panel-flush mb-5 flex items-start gap-2 p-3 text-xs">
      <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" />
      <span>A template is a title + body with <code class="font-mono">{{ '{{placeholders}}' }}</code>. Rules fill in the values at send time. Keep one Global default and add app-specific wording as needed.</span>
    </div>

    <DataState :status="status" :error="error" :empty="!data?.length" :refreshing="refreshing" empty-label="No templates yet." empty-icon="i-lucide-layout-template">
      <div class="space-y-2">
        <div v-for="t in data" :key="t.id" class="panel-flush grid grid-cols-2 items-center gap-3 p-3.5 sm:grid-cols-12">
          <div class="col-span-2 min-w-0 sm:col-span-5">
            <p class="truncate font-medium text-foam">{{ t.name }}</p>
            <p class="mt-0.5 truncate font-mono text-xs text-faint">{{ t.title }}</p>
          </div>
          <div class="sm:col-span-4">
            <span class="rounded-md px-2 py-0.5 text-xs font-medium"
              :class="t.scope === 'global' ? 'bg-beacon/10 text-beacon' : 'bg-surface-2 text-(--color-muted)'">
              {{ scopeLabel(t.scope) }}
            </span>
          </div>
          <div class="col-span-2 flex justify-end gap-1 sm:col-span-3">
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(t)" />
            <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = t" />
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="modalOpen" :title="editingId ? `Edit ${form.name}` : 'Add template'" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Name" required><UInput v-model="form.name" class="w-full" placeholder="Default alert" /></UFormField>
            <UFormField label="Scope"><USelect v-model="form.scope" :items="scopeOptions" value-key="value" label-key="label" class="w-full" /></UFormField>
          </div>
          <UFormField label="Title" required>
            <UInput v-model="form.title" class="w-full font-mono text-sm" placeholder="[{{severity}}] {{title}}" />
          </UFormField>
          <UFormField label="Body">
            <UTextarea v-model="form.body" :rows="7" class="w-full font-mono text-xs" spellcheck="false" />
          </UFormField>
          <div>
            <p class="mb-1.5 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">Insert placeholder</p>
            <div class="flex flex-wrap gap-1.5">
              <UButton v-for="v in COMMON_VARS" :key="v" size="xs" variant="soft" color="neutral" class="font-mono" :label="`{{${v}}}`" @click="insertVar(v)" />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="modalOpen = false" />
          <UButton color="primary" :label="editingId ? 'Save' : 'Create'" icon="i-lucide-check" :loading="saving" @click="save" />
        </div>
      </template>
    </UModal>

    <ConfirmDeleteModal
      type="notification.template"
      :item-name="deleteTarget?.name"
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete template"
      :message="deleteTarget ? `Template ${deleteTarget.name} will be removed. Rules using it fall back to the built-in default wording.` : ''"
      :action="confirmDelete"
    />
  </div>
</template>
