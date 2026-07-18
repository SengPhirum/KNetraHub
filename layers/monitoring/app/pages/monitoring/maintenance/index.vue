<script setup lang="ts">
// Maintenance windows — full CRUD (operator tier). Targets are devices,
// groups, or locations; behavior either suppresses alerts (still polling) or
// skips polling entirely. Recurrence repeats the window daily/weekly/monthly.
const { hasMonitoring, canOperate } = useMonitoring()
const toast = useToast()

const { data, status, refresh } = useAsyncData('monMaint',
  () => $fetch<any>('/api/monitoring/v1/maintenance?per_page=200'),
  { server: false, default: () => ({ items: [] }) })

const { data: devicesData } = useAsyncData('monMaintDevices',
  () => $fetch<any>('/api/monitoring/v1/devices?per_page=500'),
  { server: false, default: () => ({ items: [] }) })
const { data: groupsData } = useAsyncData('monMaintGroups',
  () => $fetch<any>('/api/monitoring/v1/device-groups?per_page=200'),
  { server: false, default: () => ({ items: [] }) })
const { data: locationsData } = useAsyncData('monMaintLocations',
  () => $fetch<any>('/api/monitoring/v1/locations?per_page=500'),
  { server: false, default: () => ({ items: [] }) })

const deviceItems = computed(() => (devicesData.value?.items ?? []).map((d: any) => ({ value: d.id, label: d.display_name || d.hostname })))
const groupItems = computed(() => (groupsData.value?.items ?? []).map((g: any) => ({ value: g.id, label: g.name })))
const locationItems = computed(() => (locationsData.value?.items ?? []).map((l: any) => ({ value: l.id, label: l.name })))

const behaviorItems = [
  { value: 'skip_alerts', label: 'Suppress alerts (keep polling)' },
  { value: 'skip_polling', label: 'Skip polling entirely' }
]
const recurrenceItems = [
  { value: '', label: 'One-shot' },
  { value: 'daily', label: 'Daily (same time span)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
]

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const form = reactive({
  title: '', notes: '', starts_at: '', ends_at: '', behavior: 'skip_alerts', recurrence: '',
  device_ids: [] as number[], group_ids: [] as number[], location_ids: [] as number[]
})
const editingId = ref<number | null>(null)
const modalOpen = ref(false)
const saving = ref(false)

function openCreate() {
  editingId.value = null
  const now = new Date()
  const inTwoHours = new Date(now.getTime() + 2 * 3600000)
  Object.assign(form, {
    title: '', notes: '', starts_at: toLocalInput(now), ends_at: toLocalInput(inTwoHours),
    behavior: 'skip_alerts', recurrence: '', device_ids: [], group_ids: [], location_ids: []
  })
  modalOpen.value = true
}
async function openEdit(m: any) {
  editingId.value = m.id
  Object.assign(form, {
    title: m.title, notes: m.notes || '',
    starts_at: toLocalInput(new Date(m.starts_at)), ends_at: toLocalInput(new Date(m.ends_at)),
    behavior: m.behavior, recurrence: m.recurrence || '',
    device_ids: [], group_ids: [], location_ids: []
  })
  try {
    const detail = await $fetch<any>(`/api/monitoring/v1/maintenance/${m.id}`)
    form.device_ids = (detail.targets ?? []).filter((t: any) => t.device_id).map((t: any) => t.device_id)
    form.group_ids = (detail.targets ?? []).filter((t: any) => t.group_id).map((t: any) => t.group_id)
    form.location_ids = (detail.targets ?? []).filter((t: any) => t.location_id).map((t: any) => t.location_id)
  } catch { /* modal still opens with window fields */ }
  modalOpen.value = true
}

const targetCount = computed(() => form.device_ids.length + form.group_ids.length + form.location_ids.length)

async function save() {
  saving.value = true
  try {
    const body = {
      title: form.title, notes: form.notes || null,
      starts_at: new Date(form.starts_at).toISOString(), ends_at: new Date(form.ends_at).toISOString(),
      behavior: form.behavior, recurrence: form.recurrence || null,
      targets: [
        ...form.device_ids.map((id) => ({ device_id: id })),
        ...form.group_ids.map((id) => ({ group_id: id })),
        ...form.location_ids.map((id) => ({ location_id: id }))
      ]
    }
    if (editingId.value) {
      await $fetch(`/api/monitoring/v1/maintenance/${editingId.value}`, { method: 'PUT', body })
      toast.add({ title: 'Window updated', color: 'primary', icon: 'i-lucide-check' })
    } else {
      await $fetch('/api/monitoring/v1/maintenance', { method: 'POST', body })
      toast.add({ title: 'Window created', color: 'primary', icon: 'i-lucide-check' })
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
    await $fetch(`/api/monitoring/v1/maintenance/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Window deleted', color: 'primary', icon: 'i-lucide-check' })
    deleteTarget.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Delete failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { deleting.value = false }
}

function windowState(m: any): { label: string; cls: string } {
  const now = Date.now()
  if (m.recurrence) return { label: `recurring (${m.recurrence})`, cls: 'text-sky-400' }
  if (new Date(m.ends_at).getTime() < now) return { label: 'ended', cls: 'text-faint' }
  if (new Date(m.starts_at).getTime() > now) return { label: 'scheduled', cls: 'text-amber-400' }
  return { label: 'active', cls: 'text-emerald-400' }
}
</script>

<template>
  <div>
    <PageHeader title="Maintenance" subtitle="Scheduled windows that suppress alerts or polling" icon="i-lucide-wrench">
      <template v-if="hasMonitoring && canOperate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="openCreate">Schedule window</UButton>
      </template>
    </PageHeader>
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="panel overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
          <tr><th class="px-3 py-2">Title</th><th class="px-3 py-2">State</th><th class="px-3 py-2">Behavior</th>
            <th class="px-3 py-2">Starts</th><th class="px-3 py-2">Ends</th>
            <th class="px-3 py-2 text-right">Targets</th><th class="px-3 py-2">Created by</th>
            <th v-if="canOperate" class="px-3 py-2" /></tr>
        </thead>
        <tbody>
          <tr v-if="status === 'pending'"><td colspan="8" class="px-3 py-8 text-center text-muted">Loading…</td></tr>
          <tr v-else-if="!data.items?.length"><td colspan="8" class="px-3 py-8 text-center text-muted">No maintenance windows.</td></tr>
          <tr v-for="m in data.items" :key="m.id" class="border-t border-hull">
            <td class="px-3 py-2 font-medium">{{ m.title }}<div v-if="m.notes" class="text-xs text-faint">{{ m.notes }}</div></td>
            <td class="px-3 py-2"><span :class="windowState(m).cls">{{ windowState(m).label }}</span></td>
            <td class="px-3 py-2 text-muted">{{ m.behavior === 'skip_polling' ? 'skip polling' : 'suppress alerts' }}</td>
            <td class="px-3 py-2 text-xs">{{ new Date(m.starts_at).toLocaleString() }}</td>
            <td class="px-3 py-2 text-xs">{{ new Date(m.ends_at).toLocaleString() }}</td>
            <td class="px-3 py-2 text-right">{{ m.target_count }}</td>
            <td class="px-3 py-2 text-muted">{{ m.created_by || '—' }}</td>
            <td v-if="canOperate" class="px-3 py-2 text-right whitespace-nowrap">
              <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="openEdit(m)" />
              <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteTarget = m" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UModal v-model:open="modalOpen" :title="editingId ? 'Edit maintenance window' : 'Schedule maintenance window'">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Title" required><UInput v-model="form.title" placeholder="Core switch firmware upgrade" class="w-full" /></UFormField>
          <UFormField label="Notes"><UTextarea v-model="form.notes" :rows="2" class="w-full" /></UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Starts" required><UInput v-model="form.starts_at" type="datetime-local" class="w-full" /></UFormField>
            <UFormField label="Ends" required><UInput v-model="form.ends_at" type="datetime-local" class="w-full" /></UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Behavior"><USelect v-model="form.behavior" :items="behaviorItems" class="w-full" /></UFormField>
            <UFormField label="Recurrence"><USelect v-model="form.recurrence" :items="recurrenceItems" class="w-full" /></UFormField>
          </div>
          <UFormField label="Device targets">
            <USelectMenu v-model="form.device_ids" :items="deviceItems" value-key="value" multiple searchable class="w-full" placeholder="Select devices…" />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Group targets">
              <USelectMenu v-model="form.group_ids" :items="groupItems" value-key="value" multiple class="w-full" placeholder="Groups…" />
            </UFormField>
            <UFormField label="Location targets">
              <USelectMenu v-model="form.location_ids" :items="locationItems" value-key="value" multiple class="w-full" placeholder="Locations…" />
            </UFormField>
          </div>
          <p v-if="!targetCount" class="text-xs text-amber-400">Pick at least one device, group, or location.</p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="modalOpen = false">Cancel</UButton>
          <UButton :loading="saving" :disabled="!form.title || !targetCount" @click="save">{{ editingId ? 'Save' : 'Schedule' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleteTarget" title="Delete maintenance window" @update:open="(v) => !v && (deleteTarget = null)">
      <template #body>
        <p class="text-sm text-muted">Delete <strong>{{ deleteTarget?.title }}</strong>? Suppression ends immediately.</p>
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
