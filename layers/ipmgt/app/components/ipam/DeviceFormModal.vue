<script setup lang="ts">
// Create/edit a device. Loads location/customer reference lists for the
// pickers. SNMP credentials are never returned by the server (encrypted at
// rest) - the SNMP fields start blank on edit and "blank = keep current".
const props = defineProps<{ open: boolean; device?: any | null }>()
const emit = defineEmits<{ 'update:open': [boolean]; saved: [any] }>()
const toast = useToast()

const { data: locations } = useAsyncData('ipamRefLocations', () => $fetch<any[]>('/api/ipmgt/locations'), { server: false, default: () => [] })
const { data: customers } = useAsyncData('ipamRefCustomers', () => $fetch<any[]>('/api/ipmgt/customers'), { server: false, default: () => [] })

const locationItems = computed(() => [{ value: '', label: '— None —' }, ...(locations.value || []).map((l: any) => ({ value: l.id, label: l.name }))])
const customerItems = computed(() => [{ value: '', label: '— None —' }, ...(customers.value || []).map((c: any) => ({ value: c.id, label: c.name }))])

const form = reactive<any>({})
const saving = ref(false)
const isEdit = computed(() => !!props.device)

function reset() {
  const d = props.device
  Object.assign(form, {
    hostname: d?.hostname || '', display_name: d?.display_name || '', description: d?.description || '',
    device_type: d?.device_type || 'Unknown', vendor: d?.vendor || '', model: d?.model || '',
    serial_number: d?.serial_number || '', asset_number: d?.asset_number || '', management_ip: d?.management_ip || '',
    location_id: d?.location_id || '', customer_id: d?.customer_id || '',
    status: d?.status || 'active', notes: d?.notes || '',
    snmp_version: d?.snmp_version || 'v2c', snmp_community: '',
    ...defaultIpamSnmpV3(),
    snmp_sec_level: d?.snmp_sec_level || defaultIpamSnmpV3().snmp_sec_level,
    snmp_auth_user: d?.snmp_auth_user || '',
    snmp_auth_protocol: d?.snmp_auth_protocol || defaultIpamSnmpV3().snmp_auth_protocol,
    snmp_priv_protocol: d?.snmp_priv_protocol || defaultIpamSnmpV3().snmp_priv_protocol
  })
}
watch(() => props.open, (v) => { if (v) reset() })

async function save() {
  if (!form.hostname.trim()) { toast.add({ title: 'Hostname is required', color: 'error' }); return }
  saving.value = true
  try {
    const body = { ...form, location_id: form.location_id || null, customer_id: form.customer_id || null }
    const res = isEdit.value
      ? await $fetch(`/api/ipmgt/devices/${props.device.id}`, { method: 'PUT', body })
      : await $fetch('/api/ipmgt/devices', { method: 'POST', body })
    toast.add({ title: isEdit.value ? 'Device updated' : 'Device created', color: 'primary', icon: 'i-lucide-check' })
    emit('saved', res)
    emit('update:open', false)
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UModal :open="open" @update:open="(v: boolean) => emit('update:open', v)" :title="isEdit ? 'Edit device' : 'Add device'" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Hostname" required>
            <UInput v-model="form.hostname" placeholder="core-switch-01" class="w-full" />
          </UFormField>
          <UFormField label="Display name">
            <UInput v-model="form.display_name" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <UFormField label="Type">
            <USelect v-model="form.device_type" :items="IPAM_DEVICE_TYPE_ITEMS" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Vendor">
            <UInput v-model="form.vendor" class="w-full" />
          </UFormField>
          <UFormField label="Model">
            <UInput v-model="form.model" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <UFormField label="Serial number">
            <UInput v-model="form.serial_number" class="w-full" />
          </UFormField>
          <UFormField label="Asset number">
            <UInput v-model="form.asset_number" class="w-full" />
          </UFormField>
          <UFormField label="Management IP">
            <UInput v-model="form.management_ip" placeholder="10.0.0.1" class="w-full font-mono" />
          </UFormField>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <UFormField label="Location">
            <USelect v-model="form.location_id" :items="locationItems" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Customer">
            <USelect v-model="form.customer_id" :items="customerItems" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Status">
            <USelect v-model="form.status" :items="IPAM_DEVICE_STATUS_ITEMS" value-key="value" label-key="label" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Description">
          <UTextarea v-model="form.description" class="w-full" :rows="2" />
        </UFormField>

        <div class="grid grid-cols-2 gap-4 rounded-lg bg-surface-2/40 p-3">
          <IpamDeviceSnmpFields :form="form" :keep-blank="isEdit" />
        </div>

        <UFormField label="Notes">
          <UTextarea v-model="form.notes" class="w-full" :rows="2" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton variant="ghost" @click="emit('update:open', false)">Cancel</UButton>
        <UButton color="primary" :loading="saving" :disabled="!form.hostname?.trim()" @click="save">{{ isEdit ? 'Save' : 'Create' }}</UButton>
      </div>
    </template>
  </UModal>
</template>
