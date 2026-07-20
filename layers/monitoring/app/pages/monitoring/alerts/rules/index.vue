<script setup lang="ts">
// Alert rules — full CRUD (admin tier): structured condition builder,
// scoping (devices/groups/locations), notification behavior, transports,
// template binding, enable/disable toggle.
const { hasMonitoring, canManage } = useMonitoring()
const toast = useToast()

const { data, status, refresh } = useAsyncData('monRules',
  () => $fetch<any>('/api/monitoring/v1/alerts/rules'),
  { server: false, default: () => ({ items: [] }) })

const { data: devicesData } = useAsyncData('monRuleDevices',
  () => $fetch<any>('/api/monitoring/v1/devices?per_page=500'),
  { server: false, default: () => ({ items: [] }) })
const { data: groupsData } = useAsyncData('monRuleGroups',
  () => $fetch<any>('/api/monitoring/v1/device-groups?per_page=200'),
  { server: false, default: () => ({ items: [] }) })
const { data: locationsData } = useAsyncData('monRuleLocations',
  () => $fetch<any>('/api/monitoring/v1/locations?per_page=500'),
  { server: false, default: () => ({ items: [] }) })
const { data: transportsData } = useAsyncData('monRuleTransports',
  () => $fetch<any>('/api/monitoring/v1/alerts/transports'),
  { server: false, default: () => ({ items: [] }) })
const { data: templatesData } = useAsyncData('monRuleTemplates',
  () => $fetch<any>('/api/monitoring/v1/alerts/templates'),
  { server: false, default: () => ({ items: [] }) })

const deviceItems = computed(() => (devicesData.value?.items ?? []).map((d: any) => ({ value: d.id, label: d.display_name || d.hostname })))
const groupItems = computed(() => (groupsData.value?.items ?? []).map((g: any) => ({ value: g.id, label: g.name })))
const locationItems = computed(() => (locationsData.value?.items ?? []).map((l: any) => ({ value: l.id, label: l.name })))
const transportItems = computed(() => (transportsData.value?.items ?? []).map((t: any) => ({ value: t.id, label: `${t.name} (${t.type})` })))
const templateItems = computed(() => [
  { value: null, label: '— default template —' },
  ...(templatesData.value?.items ?? []).map((t: any) => ({ value: t.id, label: t.name }))
])

const ENTITY_ITEMS = ['device', 'port', 'sensor', 'processor', 'mempool', 'storage', 'service', 'bgp_peer']
  .map((v) => ({ value: v, label: v }))
const SEVERITY_ITEMS = [{ value: 'warning', label: 'warning' }, { value: 'critical', label: 'critical' }]
// Common fields per entity type, to guide the builder (free typing still allowed server-side).
const FIELDS_BY_ENTITY: Record<string, string[]> = {
  device: ['status', 'icmp_status', 'snmp_status', 'os', 'vendor', 'hostname', 'uptime_seconds', 'last_ping_ms', 'ignored'],
  port: ['oper_status', 'admin_status', 'if_name', 'if_alias', 'in_util_percent', 'out_util_percent', 'in_errors_ps', 'out_errors_ps', 'speed_bps', 'ignored'],
  sensor: ['status', 'sensor_class', 'current_value', 'description', 'unit'],
  processor: ['usage_percent', 'description'],
  mempool: ['usage_percent', 'description', 'is_swap'],
  storage: ['usage_percent', 'description'],
  service: ['status', 'type', 'name', 'last_response_ms', 'consecutive_failures'],
  bgp_peer: ['state', 'peer_ip', 'peer_as', 'established_seconds']
}
const CMP_ITEMS = [
  { value: 'eq', label: '=' }, { value: 'ne', label: '≠' },
  { value: 'gt', label: '>' }, { value: 'ge', label: '≥' }, { value: 'lt', label: '<' }, { value: 'le', label: '≤' },
  { value: 'contains', label: 'contains' }, { value: 'not_contains', label: 'not contains' },
  { value: 'regex', label: 'regex' }, { value: 'not_regex', label: 'not regex' },
  { value: 'in', label: 'in (comma list)' }, { value: 'not_in', label: 'not in (comma list)' },
  { value: 'is_null', label: 'is empty' }, { value: 'not_null', label: 'is set' }
]

interface RuleRow { field: string; cmp: string; value: string }
const form = reactive({
  name: '', note: '', enabled: true, severity: 'critical', entity_type: 'device',
  op: 'and' as 'and' | 'or', rules: [] as RuleRow[],
  device_ids: [] as number[], group_ids: [] as number[], location_ids: [] as number[],
  delay_seconds: 0, interval_seconds: 0, max_notifications: 0,
  recovery_notification: true, invert: false,
  template_id: null as number | null, transport_ids: [] as number[]
})
const editingId = ref<number | null>(null)
const modalOpen = ref(false)
const saving = ref(false)

const fieldItems = computed(() =>
  (FIELDS_BY_ENTITY[form.entity_type] ?? FIELDS_BY_ENTITY.device!).map((f) => ({ value: f, label: f })))

function blankRule(): RuleRow {
  return { field: (FIELDS_BY_ENTITY[form.entity_type] ?? ['status'])[0]!, cmp: 'eq', value: '' }
}
function openCreate() {
  editingId.value = null
  Object.assign(form, {
    name: '', note: '', enabled: true, severity: 'critical', entity_type: 'device',
    op: 'and', rules: [], device_ids: [], group_ids: [], location_ids: [],
    delay_seconds: 0, interval_seconds: 0, max_notifications: 0,
    recovery_notification: true, invert: false, template_id: null, transport_ids: []
  })
  form.rules = [blankRule()]
  modalOpen.value = true
}
function openEdit(r: any) {
  editingId.value = r.id
  Object.assign(form, {
    name: r.name, note: r.note || '', enabled: !!r.enabled, severity: r.severity, entity_type: r.entity_type,
    op: r.conditions?.op === 'or' ? 'or' : 'and',
    rules: (r.conditions?.conditions ?? []).filter((c: any) => c.field).map((c: any) => ({
      field: c.field, cmp: c.cmp,
      value: Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')
    })),
    device_ids: r.device_ids ?? [], group_ids: r.group_ids ?? [], location_ids: r.location_ids ?? [],
    delay_seconds: r.delay_seconds, interval_seconds: r.interval_seconds, max_notifications: r.max_notifications,
    recovery_notification: !!r.recovery_notification, invert: !!r.invert,
    template_id: r.template_id, transport_ids: r.transport_ids ?? []
  })
  if (!form.rules.length) form.rules = [blankRule()]
  modalOpen.value = true
}

async function save() {
  saving.value = true
  try {
    const body: any = {
      name: form.name, note: form.note || null, enabled: form.enabled,
      severity: form.severity, entity_type: form.entity_type,
      conditions: {
        op: form.op,
        conditions: form.rules.filter((r) => r.field && r.cmp).map((r) => {
          const leaf: any = { field: r.field, cmp: r.cmp }
          if (r.cmp === 'in' || r.cmp === 'not_in') leaf.value = r.value.split(',').map((v) => v.trim()).filter(Boolean)
          else if (r.cmp !== 'is_null' && r.cmp !== 'not_null') leaf.value = r.value
          return leaf
        })
      },
      device_ids: form.device_ids.length ? form.device_ids : null,
      group_ids: form.group_ids.length ? form.group_ids : null,
      location_ids: form.location_ids.length ? form.location_ids : null,
      delay_seconds: form.delay_seconds, interval_seconds: form.interval_seconds,
      max_notifications: form.max_notifications, recovery_notification: form.recovery_notification,
      invert: form.invert, template_id: form.template_id, transport_ids: form.transport_ids
    }
    if (editingId.value) {
      await $fetch(`/api/monitoring/v1/alerts/rules/${editingId.value}`, { method: 'PUT', body })
      toast.add({ title: 'Rule updated', color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch('/api/monitoring/v1/alerts/rules', { method: 'POST', body })
      toast.add({ title: 'Rule created', color: 'primary', icon: 'i-lucide-check' })
    }
    modalOpen.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

async function toggleEnabled(r: any) {
  try {
    await $fetch(`/api/monitoring/v1/alerts/rules/${r.id}`, { method: 'PUT', body: { enabled: !r.enabled } })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' })
  }
}

const deleteTarget = ref<any>(null)
async function confirmDelete(headers: Record<string, string>) {
  if (!deleteTarget.value) return
  await $fetch(`/api/monitoring/v1/alerts/rules/${deleteTarget.value.id}`, { method: 'DELETE', headers })
  toast.add({ title: 'Rule deleted', color: 'primary', icon: 'i-lucide-check' })
  deleteTarget.value = null
  await refresh()
}
</script>

<template>
  <div>
    <PageHeader title="Alert Rules" subtitle="Structured rule conditions drive incidents" icon="i-lucide-bell-ring">
      <template #actions>
        <div class="flex gap-2">
          <NuxtLink to="/monitoring/alerts"><UButton size="sm" variant="soft" icon="i-lucide-triangle-alert">Active alerts</UButton></NuxtLink>
          <UButton v-if="hasMonitoring && canManage" icon="i-lucide-plus" size="sm" @click="openCreate">Add rule</UButton>
        </div>
      </template>
    </PageHeader>
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="panel overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
          <tr><th class="px-3 py-2">Rule</th><th class="px-3 py-2">Entity</th><th class="px-3 py-2">Severity</th>
            <th class="px-3 py-2">Enabled</th><th class="px-3 py-2 text-right">Delay</th><th class="px-3 py-2 text-right">Active</th>
            <th v-if="canManage" class="px-3 py-2" /></tr>
        </thead>
        <tbody>
          <tr v-if="status === 'pending'"><td colspan="7" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
          <tr v-for="r in data.items" :key="r.id" class="border-t border-hull">
            <td class="px-3 py-2">{{ r.name }}<div v-if="r.note" class="text-xs text-faint">{{ r.note }}</div></td>
            <td class="px-3 py-2 text-muted">{{ r.entity_type }}</td>
            <td class="px-3 py-2"><span :class="r.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'">{{ r.severity }}</span></td>
            <td class="px-3 py-2">
              <UButton v-if="canManage" size="xs" :variant="r.enabled ? 'soft' : 'ghost'" :color="r.enabled ? 'primary' : 'neutral'"
                @click="toggleEnabled(r)">{{ r.enabled ? 'Enabled' : 'Disabled' }}</UButton>
              <span v-else>{{ r.enabled ? 'Yes' : 'No' }}</span>
            </td>
            <td class="px-3 py-2 text-right text-muted">{{ r.delay_seconds }}s</td>
            <td class="px-3 py-2 text-right">
              <span v-if="r.active_alerts > 0" class="rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-400">{{ r.active_alerts }}</span>
              <span v-else class="text-faint">0</span>
            </td>
            <td v-if="canManage" class="px-3 py-2 text-right whitespace-nowrap">
              <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="openEdit(r)" />
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteTarget = r" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model:open="modalOpen" :title="editingId ? 'Edit alert rule' : 'Add alert rule'" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Name" required><UInput v-model="form.name" placeholder="Device down" class="w-full" /></UFormField>
            <UFormField label="Note"><UInput v-model="form.note" class="w-full" /></UFormField>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Entity"><USelect v-model="form.entity_type" :items="ENTITY_ITEMS" class="w-full" /></UFormField>
            <UFormField label="Severity"><USelect v-model="form.severity" :items="SEVERITY_ITEMS" class="w-full" /></UFormField>
            <UFormField label="Match"><USelect v-model="form.op" :items="[{ value: 'and', label: 'ALL (AND)' }, { value: 'or', label: 'ANY (OR)' }]" class="w-full" /></UFormField>
          </div>

          <UFormField label="Conditions">
            <div class="space-y-2">
              <div v-for="(r, i) in form.rules" :key="i" class="flex items-center gap-2">
                <USelect v-model="r.field" :items="fieldItems" class="w-44" size="sm" />
                <USelect v-model="r.cmp" :items="CMP_ITEMS" class="w-36" size="sm" />
                <UInput v-if="r.cmp !== 'is_null' && r.cmp !== 'not_null'" v-model="r.value" size="sm" class="grow" placeholder="value" />
                <UButton size="xs" variant="ghost" color="error" icon="i-lucide-x" :disabled="form.rules.length <= 1" @click="form.rules.splice(i, 1)" />
              </div>
              <UButton size="xs" variant="soft" icon="i-lucide-plus" @click="form.rules.push(blankRule())">Add condition</UButton>
            </div>
          </UFormField>
          <UCheckbox v-model="form.invert" label="Invert (alert when conditions do NOT match)" />

          <UFormField label="Scope (empty = all devices)">
            <div class="grid grid-cols-3 gap-2">
              <USelectMenu v-model="form.device_ids" :items="deviceItems" value-key="value" multiple searchable placeholder="Devices…" />
              <USelectMenu v-model="form.group_ids" :items="groupItems" value-key="value" multiple placeholder="Groups…" />
              <USelectMenu v-model="form.location_ids" :items="locationItems" value-key="value" multiple placeholder="Locations…" />
            </div>
          </UFormField>

          <div class="grid grid-cols-3 gap-3">
            <UFormField label="Delay (s)" description="Must fault this long first">
              <UInput v-model.number="form.delay_seconds" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField label="Re-notify every (s)" description="0 = notify once">
              <UInput v-model.number="form.interval_seconds" type="number" min="0" class="w-full" />
            </UFormField>
            <UFormField label="Max notifications" description="0 = unlimited">
              <UInput v-model.number="form.max_notifications" type="number" min="0" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Transports" description="Empty = default transports">
              <USelectMenu v-model="form.transport_ids" :items="transportItems" value-key="value" multiple class="w-full" placeholder="Transports…" />
            </UFormField>
            <UFormField label="Template">
              <USelect v-model="form.template_id" :items="templateItems" class="w-full" />
            </UFormField>
          </div>
          <div class="flex items-center gap-6">
            <UCheckbox v-model="form.recovery_notification" label="Send recovery notification" />
            <UCheckbox v-model="form.enabled" label="Enabled" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalOpen = false">Cancel</UButton>
          <UButton :loading="saving" :disabled="!form.name || !form.rules.length" @click="save">{{ editingId ? 'Save' : 'Add rule' }}</UButton>
        </div>
      </template>
    </UModal>

    <ConfirmDeleteModal
      type="monitoring.alert-rule"
      :item-name="deleteTarget?.name"
      :open="!!deleteTarget"
      @update:open="(v: boolean) => { if (!v) deleteTarget = null }"
      title="Delete alert rule"
      :message="deleteTarget ? `Alert rule ${deleteTarget.name} will be deleted. Its open incidents and their history are removed with it.` : ''"
      :action="confirmDelete"
    />
  </div>
</template>
