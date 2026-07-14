<script setup lang="ts">
// NAT rule bindings: an internal source (address, subnet, or free-text
// object) mapped to its translated external representation.
const { hasApp } = useAuth()
const { canCreate, canUpdate, canDelete } = useIpam()
const toast = useToast()

const { data: rules, status, error, refresh } = useAsyncData('ipamNat', () => $fetch<any[]>('/api/ipmgt/nat'), { server: false, default: () => [] })
const { data: addresses } = useAsyncData('ipamRefAddressesForNat', () => $fetch<any[]>('/api/ipmgt/addresses'), { server: false, default: () => [] })
const { data: subnets } = useAsyncData('ipamRefSubnetsForNat', () => $fetch<any[]>('/api/ipmgt/subnets'), { server: false, default: () => [] })
const { data: devices } = useAsyncData('ipamRefDevices', () => $fetch<any[]>('/api/ipmgt/devices'), { server: false, default: () => [] })
const { data: customers } = useAsyncData('ipamRefCustomers', () => $fetch<any[]>('/api/ipmgt/customers'), { server: false, default: () => [] })

const addressItems = computed(() => (addresses.value || []).map((a: any) => ({ value: a.id, label: `${a.ip}${a.hostname ? ' · ' + a.hostname : ''}` })))
const subnetItems = computed(() => (subnets.value || []).map((s: any) => ({ value: s.id, label: `${s.network} · ${s.name}` })))
const deviceItems = computed(() => [{ value: '', label: '— None —' }, ...(devices.value || []).map((d: any) => ({ value: d.id, label: d.hostname }))])
const customerItems = computed(() => [{ value: '', label: '— None —' }, ...(customers.value || []).map((c: any) => ({ value: c.id, label: c.name }))])

const RULE_TYPE_ITEMS = [{ value: 'static', label: 'Static' }, { value: 'source', label: 'Source NAT' }, { value: 'destination', label: 'Destination NAT' }, { value: 'policy', label: 'Policy NAT' }]
const SOURCE_KIND_ITEMS = [{ value: 'address', label: 'IP address' }, { value: 'subnet', label: 'Subnet' }, { value: 'text', label: 'Free text' }]

const emptyForm = () => ({
  rule_type: 'static', source_kind: 'address', source_ip_id: '', source_subnet_id: '', source_text: '',
  translated_address: '', protocol: '', port: '', device_id: '', description: '', customer_id: '', enabled: true
})
const dialog = reactive({ open: false, editing: null as any })
const form = reactive(emptyForm())
const saving = ref(false)
function openCreate() { dialog.editing = null; Object.assign(form, emptyForm()); dialog.open = true }
function openEdit(r: any) {
  dialog.editing = r
  Object.assign(form, {
    rule_type: r.rule_type, source_kind: r.source_ip_id ? 'address' : r.source_subnet_id ? 'subnet' : 'text',
    source_ip_id: r.source_ip_id || '', source_subnet_id: r.source_subnet_id || '', source_text: r.source_text || '',
    translated_address: r.translated_address, protocol: r.protocol || '', port: r.port || '',
    device_id: r.device_id || '', description: r.description || '', customer_id: r.customer_id || '', enabled: !!r.enabled
  })
  dialog.open = true
}
async function save() {
  if (!form.translated_address.trim()) return
  saving.value = true
  try {
    const body: any = {
      rule_type: form.rule_type, translated_address: form.translated_address,
      protocol: form.protocol || null, port: form.port || null, device_id: form.device_id || null,
      description: form.description || null, customer_id: form.customer_id || null, enabled: form.enabled,
      source_ip_id: form.source_kind === 'address' ? form.source_ip_id : null,
      source_subnet_id: form.source_kind === 'subnet' ? form.source_subnet_id : null,
      source_text: form.source_kind === 'text' ? form.source_text : null
    }
    if (dialog.editing) await $fetch(`/api/ipmgt/nat/${dialog.editing.id}`, { method: 'PUT', body })
    else await $fetch('/api/ipmgt/nat', { method: 'POST', body })
    toast.add({ title: dialog.editing ? 'NAT rule updated' : 'NAT rule created', color: 'primary', icon: 'i-lucide-check' })
    dialog.open = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}

const deleteTarget = ref<any | null>(null)
async function confirmDelete(password: string) {
  const r = deleteTarget.value
  if (!r) return
  await $fetch(`/api/ipmgt/nat/${r.id}`, { method: 'DELETE', headers: { 'x-confirm-password': password } })
  toast.add({ title: 'NAT rule deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}

function sourceLabel(r: any) {
  return r.source_ip_address || r.source_subnet_network || r.source_text || '—'
}
</script>

<template>
  <div>
    <PageHeader title="NAT" subtitle="Address-translation bindings" icon="i-lucide-shuffle">
      <template v-if="hasApp('ipmgt') && canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add NAT Rule</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <DataState v-else :status="status" :error="error" :empty="!rules.length" empty-label="No NAT rules yet." empty-icon="i-lucide-shuffle">
      <template #empty-action>
        <UButton v-if="canCreate" class="mt-3" icon="i-lucide-plus" size="sm" @click="openCreate">Add NAT Rule</UButton>
      </template>
      <div class="panel overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-2 text-xs uppercase text-faint">
            <tr>
              <th class="px-4 py-3 font-medium">Type</th>
              <th class="px-4 py-3 font-medium">Source</th>
              <th class="px-4 py-3 font-medium">Translated</th>
              <th class="px-4 py-3 font-medium">Device</th>
              <th class="px-4 py-3 font-medium">Enabled</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="r in rules" :key="r.id" class="hover:bg-surface-2/40">
              <td class="px-4 py-3 text-(--color-muted) capitalize">{{ r.rule_type }}</td>
              <td class="px-4 py-3 font-mono text-xs text-foam">{{ sourceLabel(r) }}</td>
              <td class="px-4 py-3 font-mono text-xs text-foam">{{ r.translated_address }}</td>
              <td class="px-4 py-3 text-(--color-muted)">{{ r.device_hostname || '—' }}</td>
              <td class="px-4 py-3"><span class="text-xs" :class="r.enabled ? 'text-emerald-400' : 'text-faint'">{{ r.enabled ? 'Yes' : 'No' }}</span></td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <UButton v-if="canUpdate" size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="openEdit(r)" />
                  <UButton v-if="canDelete" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete" @click="deleteTarget = r" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DataState>

    <UModal v-model:open="dialog.open" :title="dialog.editing ? 'Edit NAT rule' : 'Add NAT rule'" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Rule type">
              <USelect v-model="form.rule_type" :items="RULE_TYPE_ITEMS" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="Source kind">
              <USelect v-model="form.source_kind" :items="SOURCE_KIND_ITEMS" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <UFormField v-if="form.source_kind === 'address'" label="Source address" required>
            <USelect v-model="form.source_ip_id" :items="addressItems" value-key="value" label-key="label" class="w-full" placeholder="Select address" />
          </UFormField>
          <UFormField v-else-if="form.source_kind === 'subnet'" label="Source subnet" required>
            <USelect v-model="form.source_subnet_id" :items="subnetItems" value-key="value" label-key="label" class="w-full" placeholder="Select subnet" />
          </UFormField>
          <UFormField v-else label="Source (free text)" required>
            <UInput v-model="form.source_text" class="w-full" placeholder="Any / firewall object name" />
          </UFormField>
          <UFormField label="Translated address" required>
            <UInput v-model="form.translated_address" placeholder="203.0.113.10" class="w-full font-mono" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Protocol">
              <UInput v-model="form.protocol" placeholder="tcp" class="w-full" />
            </UFormField>
            <UFormField label="Port">
              <UInput v-model="form.port" placeholder="443" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Device">
              <USelect v-model="form.device_id" :items="deviceItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="Customer">
              <USelect v-model="form.customer_id" :items="customerItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Description">
            <UInput v-model="form.description" class="w-full" />
          </UFormField>
          <UCheckbox v-model="form.enabled" label="Enabled" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" @click="dialog.open = false">Cancel</UButton>
          <UButton color="primary" :loading="saving" :disabled="!form.translated_address.trim()" @click="save">{{ dialog.editing ? 'Save' : 'Create' }}</UButton>
        </div>
      </template>
    </UModal>

    <ConfirmPasswordModal
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete NAT rule"
      :message="deleteTarget ? `NAT rule for ${deleteTarget.translated_address} will be permanently removed.` : ''"
      confirm-label="Delete"
      :action="confirmDelete"
    />
  </div>
</template>
