<script setup lang="ts">
// Device Groups — full CRUD (admin tier). Static groups pick explicit member
// devices; dynamic groups define a rule tree evaluated against device fields
// (membership refreshes immediately on save and daily via housekeeping).
const { hasMonitoring, canManage } = useMonitoring()
const toast = useToast()

const { data, status, refresh } = useAsyncData('monDeviceGroups',
  () => $fetch<any>('/api/monitoring/v1/device-groups?per_page=200'),
  { server: false, default: () => ({ items: [] }) })

const { data: devicesData } = useAsyncData('monGroupDevicePicker',
  () => $fetch<any>('/api/monitoring/v1/devices?per_page=500'),
  { server: false, default: () => ({ items: [] }) })
const deviceItems = computed(() =>
  (devicesData.value?.items ?? []).map((d: any) => ({ value: d.id, label: d.display_name || d.hostname })))

const FIELD_ITEMS = [
  'os', 'os_version', 'vendor', 'hardware', 'status', 'hostname', 'display_name', 'sys_name',
  'sys_descr', 'sys_location', 'sys_contact', 'serial', 'ip', 'poller_group', 'snmp_disabled',
  'icmp_status', 'snmp_status', 'uptime_seconds', 'location_id'
].map((f) => ({ value: f, label: f }))
const CMP_ITEMS = [
  { value: 'eq', label: '=' }, { value: 'ne', label: '≠' },
  { value: 'contains', label: 'contains' }, { value: 'not_contains', label: 'not contains' },
  { value: 'regex', label: 'regex' }, { value: 'not_regex', label: 'not regex' },
  { value: 'gt', label: '>' }, { value: 'ge', label: '≥' }, { value: 'lt', label: '<' }, { value: 'le', label: '≤' },
  { value: 'in', label: 'in (comma list)' }, { value: 'not_in', label: 'not in (comma list)' },
  { value: 'is_null', label: 'is empty' }, { value: 'not_null', label: 'is set' }
]

interface RuleRow { field: string; cmp: string; value: string }
const form = reactive({
  name: '', description: '', dynamic: false,
  op: 'and' as 'and' | 'or',
  rules: [] as RuleRow[],
  device_ids: [] as number[]
})
const editingId = ref<number | null>(null)
const modalOpen = ref(false)
const saving = ref(false)

function blankRule(): RuleRow {
  return { field: 'os', cmp: 'eq', value: '' }
}
function openCreate() {
  editingId.value = null
  Object.assign(form, { name: '', description: '', dynamic: false, op: 'and', rules: [blankRule()], device_ids: [] })
  modalOpen.value = true
}
async function openEdit(g: any) {
  editingId.value = g.id
  Object.assign(form, { name: g.name, description: g.description || '', dynamic: !!g.dynamic, op: 'and', rules: [blankRule()], device_ids: [] })
  try {
    const detail = await $fetch<any>(`/api/monitoring/v1/device-groups/${g.id}`)
    const rules = detail.group?.rules
    if (rules?.conditions?.length) {
      form.op = rules.op === 'or' ? 'or' : 'and'
      form.rules = rules.conditions
        .filter((c: any) => c.field)
        .map((c: any) => ({
          field: c.field, cmp: c.cmp,
          value: Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')
        }))
      if (!form.rules.length) form.rules = [blankRule()]
    }
    form.device_ids = (detail.members ?? []).filter((m: any) => !m.dynamic).map((m: any) => m.id)
  } catch { /* edit modal still usable with blank state */ }
  modalOpen.value = true
}

function buildConditions() {
  return {
    op: form.op,
    conditions: form.rules
      .filter((r) => r.field && r.cmp)
      .map((r) => {
        const leaf: any = { field: r.field, cmp: r.cmp }
        if (r.cmp === 'in' || r.cmp === 'not_in') leaf.value = r.value.split(',').map((v) => v.trim()).filter(Boolean)
        else if (r.cmp !== 'is_null' && r.cmp !== 'not_null') leaf.value = r.value
        return leaf
      })
  }
}

async function save() {
  saving.value = true
  try {
    const body: any = {
      name: form.name,
      description: form.description || null,
      rules: form.dynamic ? buildConditions() : null,
      device_ids: form.dynamic ? undefined : form.device_ids
    }
    if (editingId.value) {
      await $fetch(`/api/monitoring/v1/device-groups/${editingId.value}`, { method: 'PUT', body })
      toast.add({ title: 'Group updated', color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch('/api/monitoring/v1/device-groups', { method: 'POST', body })
      toast.add({ title: 'Group created', color: 'primary', icon: 'i-lucide-check' })
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
    await $fetch(`/api/monitoring/v1/device-groups/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Group deleted', color: 'primary', icon: 'i-lucide-check' })
    deleteTarget.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { deleting.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="Device Groups" subtitle="Static and dynamic device groups" icon="i-lucide-folder-tree">
      <template v-if="hasMonitoring && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Add group</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access to the Monitoring app.</div>
    <div v-else class="panel overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
          <tr><th class="px-3 py-2">Group</th><th class="px-3 py-2">Description</th><th class="px-3 py-2">Type</th>
            <th class="px-3 py-2 text-right">Devices</th><th v-if="canManage" class="px-3 py-2" /></tr>
        </thead>
        <tbody>
          <tr v-if="status === 'pending'"><td colspan="5" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
          <tr v-else-if="!data.items?.length"><td colspan="5" class="px-3 py-8 text-center text-muted">No groups yet. Groups scope alert rules, maintenance windows, and module settings.</td></tr>
          <tr v-for="g in data.items" :key="g.id" class="border-t border-hull">
            <td class="px-3 py-2 font-medium">{{ g.name }}</td>
            <td class="px-3 py-2 text-muted">{{ g.description || '—' }}</td>
            <td class="px-3 py-2"><span :class="g.dynamic ? 'text-sky-400' : 'text-muted'">{{ g.dynamic ? 'Dynamic' : 'Static' }}</span></td>
            <td class="px-3 py-2 text-right">{{ g.device_count }}</td>
            <td v-if="canManage" class="px-3 py-2 text-right whitespace-nowrap">
              <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="openEdit(g)" />
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteTarget = g" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model:open="modalOpen" :title="editingId ? 'Edit group' : 'Add group'">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" placeholder="Core switches" class="w-full" /></UFormField>
          <UFormField label="Description"><UInput v-model="form.description" class="w-full" /></UFormField>
          <UFormField label="Membership">
            <USelect v-model="form.dynamic" :items="[{ value: false, label: 'Static — pick devices' }, { value: true, label: 'Dynamic — rule-based' }]" class="w-full" />
          </UFormField>

          <UFormField v-if="!form.dynamic" label="Devices">
            <USelectMenu v-model="form.device_ids" :items="deviceItems" value-key="value" multiple searchable class="w-full"
              :placeholder="deviceItems.length ? 'Select devices…' : 'No devices yet'" />
          </UFormField>

          <template v-else>
            <UFormField label="Match">
              <USelect v-model="form.op" :items="[{ value: 'and', label: 'ALL rules (AND)' }, { value: 'or', label: 'ANY rule (OR)' }]" class="w-full" />
            </UFormField>
            <div class="space-y-2">
              <div v-for="(r, i) in form.rules" :key="i" class="flex items-center gap-2">
                <USelect v-model="r.field" :items="FIELD_ITEMS" class="w-40" size="sm" />
                <USelect v-model="r.cmp" :items="CMP_ITEMS" class="w-36" size="sm" />
                <UInput v-if="r.cmp !== 'is_null' && r.cmp !== 'not_null'" v-model="r.value" size="sm" class="grow" placeholder="value" />
                <UButton size="xs" variant="ghost" color="error" icon="i-lucide-x" :disabled="form.rules.length <= 1" @click="form.rules.splice(i, 1)" />
              </div>
              <UButton size="xs" variant="soft" icon="i-lucide-plus" @click="form.rules.push(blankRule())">Add rule</UButton>
              <p class="text-xs text-faint">Fields are device columns (e.g. os = ios, hostname contains "core"). Membership recomputes on save and daily.</p>
            </div>
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalOpen = false">Cancel</UButton>
          <UButton :loading="saving" :disabled="!form.name" @click="save">{{ editingId ? 'Save' : 'Add group' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleteTarget" title="Delete group" @update:open="(v) => !v && (deleteTarget = null)">
      <template #body>
        <p class="text-sm text-muted">
          Delete <strong>{{ deleteTarget?.name }}</strong>? Alert rules and maintenance windows scoped to it lose that scope; devices are unaffected.
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
