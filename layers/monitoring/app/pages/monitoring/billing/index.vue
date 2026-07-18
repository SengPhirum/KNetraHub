<script setup lang="ts">
// Billing — full CRUD (admin tier): quota or 95th-percentile (CDR) bills over
// selected ports, with the current period's usage shown inline.
const { hasMonitoring, canManage, formatBytes, formatBits } = useMonitoring()
const toast = useToast()

const { data, status, refresh } = useAsyncData('monBills',
  () => $fetch<any>('/api/monitoring/v1/bills?per_page=200'),
  { server: false, default: () => ({ items: [] }) })

const { data: portsData } = useAsyncData('monBillPorts',
  () => $fetch<any>('/api/monitoring/v1/ports?per_page=500'),
  { server: false, default: () => ({ items: [] }) })
const portItems = computed(() => (portsData.value?.items ?? []).map((p: any) => ({
  value: p.id, label: `${p.hostname} — ${p.if_name || p.if_index}${p.if_alias ? ` (${p.if_alias})` : ''}`
})))

const typeItems = [
  { value: 'quota', label: 'Quota (bytes per period)' },
  { value: 'cdr', label: '95th percentile (committed rate)' }
]
const directionItems = [
  { value: 'sum', label: 'In + Out' }, { value: 'in', label: 'In only' },
  { value: 'out', label: 'Out only' }, { value: 'max', label: 'Max of In/Out' }
]

const form = reactive({
  name: '', bill_type: 'quota', direction: 'sum',
  quota_gb: '' as any, cdr_mbps: '' as any, bill_day: 1,
  contact: '', notes: '', port_ids: [] as number[]
})
const editingId = ref<number | null>(null)
const modalOpen = ref(false)
const saving = ref(false)

function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', bill_type: 'quota', direction: 'sum', quota_gb: '', cdr_mbps: '', bill_day: 1, contact: '', notes: '', port_ids: [] })
  modalOpen.value = true
}
async function openEdit(b: any) {
  editingId.value = b.id
  Object.assign(form, {
    name: b.name, bill_type: b.bill_type, direction: b.direction,
    quota_gb: b.quota_bytes != null ? (Number(b.quota_bytes) / 1e9).toString() : '',
    cdr_mbps: b.cdr_bps != null ? (Number(b.cdr_bps) / 1e6).toString() : '',
    bill_day: b.bill_day ?? 1, contact: b.contact || '', notes: b.notes || '', port_ids: []
  })
  try {
    const detail = await $fetch<any>(`/api/monitoring/v1/bills/${b.id}`)
    form.port_ids = (detail.ports ?? []).map((p: any) => p.id)
  } catch { /* modal still opens */ }
  modalOpen.value = true
}

async function save() {
  saving.value = true
  try {
    const body = {
      name: form.name, bill_type: form.bill_type, direction: form.direction,
      quota_bytes: form.bill_type === 'quota' && form.quota_gb !== '' ? Math.round(Number(form.quota_gb) * 1e9) : null,
      cdr_bps: form.bill_type === 'cdr' && form.cdr_mbps !== '' ? Math.round(Number(form.cdr_mbps) * 1e6) : null,
      bill_day: form.bill_day, contact: form.contact || null, notes: form.notes || null,
      port_ids: form.port_ids
    }
    if (editingId.value) {
      await $fetch(`/api/monitoring/v1/bills/${editingId.value}`, { method: 'PUT', body })
      toast.add({ title: 'Bill updated', color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch('/api/monitoring/v1/bills', { method: 'POST', body })
      toast.add({ title: 'Bill created', color: 'primary', icon: 'i-lucide-check' })
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
    await $fetch(`/api/monitoring/v1/bills/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Bill deleted', color: 'primary', icon: 'i-lucide-check' })
    deleteTarget.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { deleting.value = false }
}

const formValid = computed(() => {
  if (!form.name) return false
  if (form.bill_type === 'quota') return form.quota_gb !== '' && Number(form.quota_gb) > 0
  return form.cdr_mbps !== '' && Number(form.cdr_mbps) > 0
})
</script>

<template>
  <div>
    <PageHeader title="Billing" subtitle="95th-percentile and quota traffic bills" icon="i-lucide-receipt">
      <template v-if="hasMonitoring && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add bill</UButton>
      </template>
    </PageHeader>
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="panel overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
          <tr><th class="px-3 py-2">Bill</th><th class="px-3 py-2">Type</th><th class="px-3 py-2">Direction</th>
            <th class="px-3 py-2 text-right">Ports</th><th class="px-3 py-2 text-right">Allowance</th>
            <th class="px-3 py-2 text-right">Current period</th><th v-if="canManage" class="px-3 py-2" /></tr>
        </thead>
        <tbody>
          <tr v-if="status === 'pending'"><td colspan="7" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
          <tr v-else-if="!data.items?.length"><td colspan="7" class="px-3 py-8 text-center text-muted">No bills yet — bill traffic on any set of monitored ports.</td></tr>
          <tr v-for="b in data.items" :key="b.id" class="border-t border-hull">
            <td class="px-3 py-2 font-medium">{{ b.name }}<div v-if="b.contact" class="text-xs text-faint">{{ b.contact }}</div></td>
            <td class="px-3 py-2 text-muted">{{ b.bill_type === 'cdr' ? '95th %ile' : 'quota' }}</td>
            <td class="px-3 py-2 text-muted">{{ b.direction }}</td>
            <td class="px-3 py-2 text-right">{{ b.port_count }}</td>
            <td class="px-3 py-2 text-right text-muted">
              <template v-if="b.bill_type === 'quota'">{{ formatBytes(Number(b.quota_bytes)) }}</template>
              <template v-else>{{ formatBits(Number(b.cdr_bps)) }}</template>
            </td>
            <td class="px-3 py-2 text-right">
              <template v-if="b.bill_type === 'quota'">
                {{ b.current_total_bytes != null ? formatBytes(Number(b.current_total_bytes)) : '—' }}
                <span v-if="b.current_overage_bytes != null && Number(b.current_overage_bytes) > 0" class="ml-1 text-xs text-rose-400">over</span>
              </template>
              <template v-else>{{ b.current_p95_bps != null ? formatBits(Number(b.current_p95_bps)) : '—' }}</template>
            </td>
            <td v-if="canManage" class="px-3 py-2 text-right whitespace-nowrap">
              <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="openEdit(b)" />
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteTarget = b" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model:open="modalOpen" :title="editingId ? 'Edit bill' : 'Add bill'" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" placeholder="Customer uplink" class="w-full" /></UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Bill type"><USelect v-model="form.bill_type" :items="typeItems" class="w-full" /></UFormField>
            <UFormField label="Direction"><USelect v-model="form.direction" :items="directionItems" class="w-full" /></UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField v-if="form.bill_type === 'quota'" label="Quota (GB per period)" required>
              <UInput v-model="form.quota_gb" type="number" min="0" step="any" placeholder="1000" class="w-full" />
            </UFormField>
            <UFormField v-else label="Committed rate (Mbps)" required>
              <UInput v-model="form.cdr_mbps" type="number" min="0" step="any" placeholder="100" class="w-full" />
            </UFormField>
            <UFormField label="Bill day (period starts)" description="Day of month, 1–28">
              <UInput v-model.number="form.bill_day" type="number" min="1" max="28" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Ports" :description="portItems.length ? undefined : 'No monitored ports yet'">
            <USelectMenu v-model="form.port_ids" :items="portItems" value-key="value" multiple searchable class="w-full" placeholder="Select ports…" />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Contact"><UInput v-model="form.contact" class="w-full" /></UFormField>
            <UFormField label="Notes"><UInput v-model="form.notes" class="w-full" /></UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalOpen = false">Cancel</UButton>
          <UButton :loading="saving" :disabled="!formValid" @click="save">{{ editingId ? 'Save' : 'Add bill' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleteTarget" title="Delete bill" @update:open="(v) => !v && (deleteTarget = null)">
      <template #body>
        <p class="text-sm text-muted">Delete <strong>{{ deleteTarget?.name }}</strong> and its billing history?</p>
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
