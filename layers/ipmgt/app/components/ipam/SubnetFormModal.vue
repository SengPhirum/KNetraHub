<script setup lang="ts">
// Create/edit a subnet. Loads section/VLAN/VRF reference lists for the pickers.
// Emits `saved` after a successful write so the parent can refresh.
const props = defineProps<{ open: boolean; subnet?: any | null; presetSectionId?: string | null }>()
const emit = defineEmits<{ 'update:open': [boolean]; saved: [any] }>()
const toast = useToast()

const { data: sections } = useAsyncData('ipamRefSections', () => $fetch<any[]>('/api/ipmgt/sections'), { server: false, default: () => [] })
const { data: vlans } = useAsyncData('ipamRefVlans', () => $fetch<any[]>('/api/ipmgt/vlans'), { server: false, default: () => [] })
const { data: vrfs } = useAsyncData('ipamRefVrfs', () => $fetch<any[]>('/api/ipmgt/vrfs'), { server: false, default: () => [] })
const { data: locations } = useAsyncData('ipamRefLocations', () => $fetch<any[]>('/api/ipmgt/locations'), { server: false, default: () => [] })
const { data: customers } = useAsyncData('ipamRefCustomers', () => $fetch<any[]>('/api/ipmgt/customers'), { server: false, default: () => [] })

const sectionItems = computed(() => [{ value: '', label: '— None —' }, ...(sections.value || []).map((s: any) => ({ value: s.id, label: s.name }))])
const vlanItems = computed(() => [{ value: '', label: '— None —' }, ...(vlans.value || []).map((v: any) => ({ value: v.id, label: `VLAN ${v.vlan_id} · ${v.name}` }))])
const vrfItems = computed(() => [{ value: '', label: '— None (global) —' }, ...(vrfs.value || []).map((v: any) => ({ value: v.id, label: v.name }))])
const locationItems = computed(() => [{ value: '', label: '— None —' }, ...(locations.value || []).map((l: any) => ({ value: l.id, label: l.name }))])
const customerItems = computed(() => [{ value: '', label: '— None —' }, ...(customers.value || []).map((c: any) => ({ value: c.id, label: c.name }))])

const form = reactive<any>({})
const saving = ref(false)
const isEdit = computed(() => !!props.subnet)
const cfRef = ref()

function reset() {
  const s = props.subnet
  Object.assign(form, {
    name: s?.name || '', network: s?.network || '', section_id: s?.section_id || props.presetSectionId || '',
    vlan_ref: s?.vlan_ref || '', vrf_id: s?.vrf_id || '', gateway: s?.gateway || '',
    dns_servers: s?.dns_servers || '', location: s?.location || '', owner: s?.owner || '', description: s?.description || '',
    location_id: s?.location_id || '', customer_id: s?.customer_id || '',
    allow_requests: !!s?.allow_requests, scan_enabled: !!s?.scan_enabled, ping_enabled: !!s?.ping_enabled,
    dns_resolve: !!s?.dns_resolve, dhcp_range: !!s?.dhcp_range
  })
}
watch(() => props.open, (v) => { if (v) reset() })

async function save() {
  if (!form.network.trim()) { toast.add({ title: 'CIDR is required', color: 'error' }); return }
  saving.value = true
  try {
    const body = {
      ...form,
      section_id: form.section_id || null, vlan_ref: form.vlan_ref || null, vrf_id: form.vrf_id || null,
      location_id: form.location_id || null, customer_id: form.customer_id || null
    }
    const res: any = isEdit.value
      ? await $fetch(`/api/ipmgt/subnets/${props.subnet.id}`, { method: 'PUT', body })
      : await $fetch('/api/ipmgt/subnets', { method: 'POST', body })
    await cfRef.value?.saveValues(isEdit.value ? props.subnet.id : res.id)
    toast.add({ title: isEdit.value ? 'Subnet updated' : 'Subnet created', color: 'primary', icon: 'i-lucide-check' })
    emit('saved', res)
    emit('update:open', false)
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UModal :open="open" @update:open="(v: boolean) => emit('update:open', v)" :title="isEdit ? 'Edit subnet' : 'Add subnet'" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="CIDR" required help="e.g. 10.0.1.0/24 or 2001:db8::/64">
            <UInput v-model="form.network" placeholder="10.0.1.0/24" class="w-full font-mono" />
          </UFormField>
          <UFormField label="Name">
            <UInput v-model="form.name" placeholder="Server farm" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-3 gap-4">
          <UFormField label="Section">
            <USelect v-model="form.section_id" :items="sectionItems" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="VLAN">
            <USelect v-model="form.vlan_ref" :items="vlanItems" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="VRF">
            <USelect v-model="form.vrf_id" :items="vrfItems" value-key="value" label-key="label" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Gateway">
            <UInput v-model="form.gateway" placeholder="10.0.1.254" class="w-full" />
          </UFormField>
          <UFormField label="DNS servers">
            <UInput v-model="form.dns_servers" placeholder="8.8.8.8, 8.8.4.4" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Location">
            <UInput v-model="form.location" class="w-full" />
          </UFormField>
          <UFormField label="Owner / department">
            <UInput v-model="form.owner" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Location record" help="Linked location, if one has been added">
            <USelect v-model="form.location_id" :items="locationItems" value-key="value" label-key="label" class="w-full" />
          </UFormField>
          <UFormField label="Customer" help="Linked customer, if one has been added">
            <USelect v-model="form.customer_id" :items="customerItems" value-key="value" label-key="label" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Description">
          <UTextarea v-model="form.description" class="w-full" :rows="2" />
        </UFormField>
        <div class="flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-surface-2/40 p-3">
          <UCheckbox v-model="form.allow_requests" label="Allow requests" />
          <UCheckbox v-model="form.scan_enabled" label="Scan enabled" />
          <UCheckbox v-model="form.ping_enabled" label="Ping check" />
          <UCheckbox v-model="form.dns_resolve" label="DNS resolve" />
          <UCheckbox v-model="form.dhcp_range" label="DHCP range" />
        </div>
        <IpamCustomFieldsPanel ref="cfRef" entity-type="subnet" :entity-id="isEdit ? subnet.id : null" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton variant="ghost" @click="emit('update:open', false)">Cancel</UButton>
        <UButton color="primary" :loading="saving" :disabled="!form.network?.trim()" @click="save">{{ isEdit ? 'Save' : 'Create' }}</UButton>
      </div>
    </template>
  </UModal>
</template>
