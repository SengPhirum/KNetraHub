<script setup lang="ts">
// Encrypted vault: infrastructure secrets (passwords, API credentials,
// certificates, notes). Values are never present in the list/edit payload -
// only the dedicated reveal action (re-authorized + audited) ever returns
// plaintext, and only for one item at a time, held in memory only.
const { hasApp, hasPermission } = useAuth()
const canManage = computed(() => hasPermission('ipmgt.settings'))
const toast = useToast()

const { data: items, status, error, refresh } = useAsyncData('ipamVault', () => $fetch<any[]>('/api/ipmgt/vault'), { server: false, default: () => [] })
const { data: devices } = useAsyncData('ipamRefDevices', () => $fetch<any[]>('/api/ipmgt/devices'), { server: false, default: () => [] })
const { data: locations } = useAsyncData('ipamRefLocations', () => $fetch<any[]>('/api/ipmgt/locations'), { server: false, default: () => [] })
const deviceItems = computed(() => [{ value: '', label: '— None —' }, ...(devices.value || []).map((d: any) => ({ value: d.id, label: d.hostname }))])
const locationItems = computed(() => [{ value: '', label: '— None —' }, ...(locations.value || []).map((l: any) => ({ value: l.id, label: l.name }))])

const TYPE_ITEMS = [
  { value: 'password', label: 'Password' }, { value: 'api_credential', label: 'API credential' },
  { value: 'certificate', label: 'Certificate' }, { value: 'note', label: 'Secure note' }
]
const typeLabel = (v: string) => TYPE_ITEMS.find((t) => t.value === v)?.label || v
const typeIcon = (v: string) => ({ password: 'i-lucide-key-round', api_credential: 'i-lucide-key', certificate: 'i-lucide-file-badge', note: 'i-lucide-sticky-note' }[v] || 'i-lucide-lock')

function expiryClass(date: string | null) {
  if (!date) return ''
  const days = (Date.parse(date) - Date.now()) / 86400000
  return days < 0 ? 'text-rose-400' : days < 30 ? 'text-amber-400' : ''
}

const emptyForm = () => ({ name: '', item_type: 'password', value: '', username: '', url: '', expiry_date: '', owner: '', related_device_id: '', related_location_id: '', notes: '' })
const dialog = reactive({ open: false, editing: null as any })
const form = reactive(emptyForm())
const saving = ref(false)
function openCreate() { dialog.editing = null; Object.assign(form, emptyForm()); dialog.open = true }
function openEdit(v: any) {
  dialog.editing = v
  Object.assign(form, {
    name: v.name, item_type: v.item_type, value: '', username: v.username || '', url: v.url || '',
    expiry_date: v.expiry_date || '', owner: v.owner || '', related_device_id: v.related_device_id || '',
    related_location_id: v.related_location_id || '', notes: v.notes || ''
  })
  dialog.open = true
}
async function save() {
  if (!form.name.trim()) return
  if (!dialog.editing && !form.value.trim()) { toast.add({ title: 'A value is required', color: 'error' }); return }
  saving.value = true
  try {
    const body = { ...form, related_device_id: form.related_device_id || null, related_location_id: form.related_location_id || null }
    if (dialog.editing) await $fetch(`/api/ipmgt/vault/${dialog.editing.id}`, { method: 'PUT', body })
    else await $fetch('/api/ipmgt/vault', { method: 'POST', body })
    toast.add({ title: dialog.editing ? 'Vault item updated' : 'Vault item created', color: 'primary', icon: 'i-lucide-check' })
    dialog.open = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}

const deleteTarget = ref<any | null>(null)
async function confirmDelete(password: string) {
  const v = deleteTarget.value
  if (!v) return
  await $fetch(`/api/ipmgt/vault/${v.id}`, { method: 'DELETE', headers: { 'x-confirm-password': password } })
  toast.add({ title: 'Vault item deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}

// ── Reveal ──────────────────────────────────────────────────────────────
const revealTarget = ref<any | null>(null)
const revealedValue = ref<string | null>(null)
const revealedFor = ref<any | null>(null)
async function doReveal(password: string) {
  const v = revealTarget.value
  if (!v) return
  const res = await $fetch<any>(`/api/ipmgt/vault/${v.id}/reveal`, { method: 'POST', headers: { 'x-confirm-password': password } })
  revealedValue.value = res.value
  revealedFor.value = v
}
function closeReveal() { revealedValue.value = null; revealedFor.value = null }
async function copyRevealed() {
  if (!revealedValue.value) return
  await navigator.clipboard.writeText(revealedValue.value)
  toast.add({ title: 'Copied to clipboard', color: 'primary', icon: 'i-lucide-check' })
}
</script>

<template>
  <div>
    <PageHeader title="Vault" subtitle="Encrypted infrastructure secrets and certificates" icon="i-lucide-shield-check">
      <template v-if="hasApp('ipmgt') && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add Item</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>
    <div v-else-if="!canManage" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-shield-alert" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">The vault requires manager-level IPAM access.</p>
    </div>

    <DataState v-else :status="status" :error="error" :empty="!items.length" empty-label="No vault items yet." empty-icon="i-lucide-shield-check">
      <template #empty-action>
        <UButton class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add Item</UButton>
      </template>
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-2 text-xs uppercase text-faint">
            <tr>
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-4 py-3 font-medium">Type</th>
              <th class="px-4 py-3 font-medium">Owner</th>
              <th class="px-4 py-3 font-medium">Related to</th>
              <th class="px-4 py-3 font-medium">Expiry</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="v in items" :key="v.id" class="hover:bg-surface-2/40">
              <td class="px-4 py-3 font-medium text-foam"><UIcon :name="typeIcon(v.item_type)" class="mr-1.5 inline size-3.5 text-faint" />{{ v.name }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ typeLabel(v.item_type) }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ v.owner || '—' }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ v.device_hostname || v.location_name || '—' }}</td>
              <td class="px-4 py-3 text-xs" :class="expiryClass(v.expiry_date)">{{ v.expiry_date || '—' }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <UButton size="xs" variant="ghost" icon="i-lucide-eye" aria-label="Reveal" @click="revealTarget = v" />
                  <UButton size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(v)" />
                  <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = v" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="dialog.open" :title="dialog.editing ? 'Edit vault item' : 'Add vault item'" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Name" required>
              <UInput v-model="form.name" class="w-full" />
            </UFormField>
            <UFormField label="Type">
              <USelect v-model="form.item_type" :items="TYPE_ITEMS" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <UFormField :label="dialog.editing ? 'New value' : 'Value'" :required="!dialog.editing" :help="dialog.editing ? 'Leave blank to keep the current value' : undefined">
            <UTextarea v-model="form.value" type="password" class="w-full font-mono" :rows="3" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Username">
              <UInput v-model="form.username" class="w-full" />
            </UFormField>
            <UFormField label="URL">
              <UInput v-model="form.url" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Owner">
              <UInput v-model="form.owner" class="w-full" />
            </UFormField>
            <UFormField label="Expiry date">
              <UInput v-model="form.expiry_date" type="date" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Related device">
              <USelect v-model="form.related_device_id" :items="deviceItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="Related location">
              <USelect v-model="form.related_location_id" :items="locationItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Notes">
            <UTextarea v-model="form.notes" class="w-full" :rows="2" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" @click="dialog.open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" @click="save">{{ dialog.editing ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </UModal>

    <ConfirmPasswordModal
      :open="!!revealTarget"
      @update:open="(v: boolean) => { if (!v) revealTarget = null }"
      title="Reveal secret"
      :message="revealTarget ? `Confirm your password to reveal ${revealTarget.name}. This access is logged.` : ''"
      confirm-label="Reveal"
      :action="doReveal"
    />

    <UModal :open="!!revealedValue" @update:open="(v: boolean) => { if (!v) closeReveal() }" :title="revealedFor?.name || 'Revealed value'">
      <template #body>
        <div class="space-y-3">
          <p class="text-xs text-amber-400">This value is shown once and not stored on screen after you close this dialog.</p>
          <UTextarea :model-value="revealedValue || ''" readonly class="w-full font-mono" :rows="4" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" icon="i-lucide-copy" @click="copyRevealed">Copy</UButton>
          <UButton color="primary" @click="closeReveal">Close</UButton>
        </div>
      </template>
    </UModal>

    <ConfirmPasswordModal
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete vault item"
      :message="deleteTarget ? `${deleteTarget.name} will be permanently removed.` : ''"
      confirm-label="Delete"
      :action="confirmDelete"
    />
  </div>
</template>
