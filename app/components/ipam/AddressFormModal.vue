<script setup lang="ts">
// Create/edit an IP address. When `subnetId`/`presetIp` are given (e.g. from the
// subnet grid), the subnet is fixed and the IP is pre-filled.
const props = defineProps<{ open: boolean; address?: any | null; subnetId?: string | null; presetIp?: string | null }>()
const emit = defineEmits<{ 'update:open': [boolean]; saved: [any] }>()
const toast = useToast()
const { statusItems } = useIpam()

const { data: subnets } = useAsyncData('ipamRefSubnetsForAddr', () => $fetch<any[]>('/api/ipmgt/subnets'), { server: false, default: () => [] })
const subnetItems = computed(() => (subnets.value || []).map((s: any) => ({ value: s.id, label: `${s.name} · ${s.network}` })))

const form = reactive<any>({})
const saving = ref(false)
const isEdit = computed(() => !!props.address)
const lockSubnet = computed(() => !!props.subnetId || isEdit.value)

function reset() {
  const a = props.address
  Object.assign(form, {
    subnet_id: a?.subnet_id || props.subnetId || '',
    ip: a?.ip || props.presetIp || '',
    hostname: a?.hostname || '', status: a?.status || 'used', mac: a?.mac || '', device: a?.device || '',
    owner: a?.owner || '', description: a?.description || '', dns_name: a?.dns_name || '', ptr: a?.ptr || '', nat_to: a?.nat_to || '', note: a?.note || ''
  })
}
watch(() => props.open, (v) => { if (v) reset() })

async function save() {
  if (!form.subnet_id) { toast.add({ title: 'Select a subnet', color: 'error' }); return }
  if (!form.ip.trim()) { toast.add({ title: 'IP is required', color: 'error' }); return }
  saving.value = true
  try {
    const res = isEdit.value
      ? await $fetch(`/api/ipmgt/addresses/${props.address.id}`, { method: 'PUT', body: form })
      : await $fetch('/api/ipmgt/addresses', { method: 'POST', body: form })
    toast.add({ title: isEdit.value ? 'Address updated' : 'Address created', color: 'primary', icon: 'i-lucide-check' })
    emit('saved', res)
    emit('update:open', false)
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UModal :open="open" @update:open="(v: boolean) => emit('update:open', v)" :title="isEdit ? 'Edit address' : 'Add address'" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Subnet" required>
            <USelect v-model="form.subnet_id" :items="subnetItems" value-key="value" label-key="label" class="w-full" :disabled="lockSubnet" placeholder="Select subnet" />
          </UFormField>
          <UFormField label="IP address" required>
            <UInput v-model="form.ip" placeholder="10.0.1.10" class="w-full font-mono" />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Hostname">
            <UInput v-model="form.hostname" class="w-full" />
          </UFormField>
          <UFormField label="Status">
            <USelect v-model="form.status" :items="statusItems" value-key="value" label-key="label" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="MAC address">
            <UInput v-model="form.mac" placeholder="00:1A:2B:3C:4D:5E" class="w-full font-mono" />
          </UFormField>
          <UFormField label="Device">
            <UInput v-model="form.device" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Owner / team">
            <UInput v-model="form.owner" class="w-full" />
          </UFormField>
          <UFormField label="NAT mapping">
            <UInput v-model="form.nat_to" placeholder="External IP" class="w-full font-mono" />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="DNS name">
            <UInput v-model="form.dns_name" class="w-full" />
          </UFormField>
          <UFormField label="PTR record">
            <UInput v-model="form.ptr" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Description">
          <UTextarea v-model="form.description" class="w-full" :rows="2" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton variant="ghost" @click="emit('update:open', false)">Cancel</UButton>
        <UButton color="primary" :loading="saving" :disabled="!form.ip?.trim() || !form.subnet_id" @click="save">{{ isEdit ? 'Save' : 'Create' }}</UButton>
      </div>
    </template>
  </UModal>
</template>
