<script setup lang="ts">
// Rack elevation: a clickable per-U grid (front/rear toggle), one row per
// rack unit, merged into item spans. Click an empty U to place something
// there; click a placed item to edit or remove it.
const route = useRoute()
const toast = useToast()
const { hasApp } = useAuth()
const { canCreate, canUpdate, canDelete } = useIpam()
const id = computed(() => route.params.id as string)

const { data: rack, status, error, refresh } = useAsyncData('ipamRackDetail', () => $fetch<any>(`/api/ipmgt/racks/${id.value}`), { server: false, default: () => null, watch: [id] })
const { data: devices } = useAsyncData('ipamRefDevicesForRack', () => $fetch<any[]>('/api/ipmgt/devices'), { server: false, default: () => [] })
const deviceItems = computed(() => [{ value: '', label: '— None (passive item) —' }, ...(devices.value || []).map((d: any) => ({ value: d.id, label: d.hostname }))])

const side = ref<'front' | 'rear'>('front')

const ITEM_TYPE_ITEMS = [
  { value: 'device', label: 'Device' }, { value: 'patch-panel', label: 'Patch panel' },
  { value: 'pdu', label: 'Power (PDU)' }, { value: 'shelf', label: 'Shelf' },
  { value: 'chassis', label: 'Chassis' }, { value: 'blank', label: 'Blank panel' }, { value: 'other', label: 'Other' }
]

// U numbers in top-to-bottom display order.
const uOrder = computed(() => {
  if (!rack.value) return []
  const { starting_unit, size_u, orientation } = rack.value
  const arr = Array.from({ length: size_u }, (_, i) => starting_unit + i)
  return orientation === 'bottom-up' ? arr.reverse() : arr
})

// Rows for the current side: merged item spans + empty single-U rows, in display order, skipping U's covered by a preceding span.
const rows = computed(() => {
  if (!rack.value) return []
  const items = (rack.value.items || []).filter((i: any) => i.side === side.value)
  const byStartU = new Map(items.map((i: any) => [i.position_u, i]))
  const covered = new Set<number>()
  for (const i of items) for (let u = i.position_u; u < i.position_u + i.height_u; u++) covered.add(u)

  const out: { u: number; item: any | null; span: number }[] = []
  for (const u of uOrder.value) {
    if (byStartU.has(u)) { out.push({ u, item: byStartU.get(u), span: byStartU.get(u).height_u }); continue }
    if (covered.has(u)) continue
    out.push({ u, item: null, span: 1 })
  }
  return out
})

const itemDialog = reactive({ open: false, editing: null as any })
const itemForm = reactive({ name: '', item_type: 'device', device_id: '', position_u: 1, height_u: 1, side: 'front', color: '', notes: '' })
const savingItem = ref(false)
function openAddItem(u: number) {
  itemDialog.editing = null
  Object.assign(itemForm, { name: '', item_type: 'device', device_id: '', position_u: u, height_u: 1, side: side.value, color: '', notes: '' })
  itemDialog.open = true
}
function openEditItem(item: any) {
  itemDialog.editing = item
  Object.assign(itemForm, {
    name: item.name, item_type: item.item_type, device_id: item.device_id || '', position_u: item.position_u,
    height_u: item.height_u, side: item.side, color: item.color || '', notes: item.notes || ''
  })
  itemDialog.open = true
}
async function saveItem() {
  if (!itemForm.name.trim()) return
  savingItem.value = true
  try {
    const body = { ...itemForm, device_id: itemForm.device_id || null }
    if (itemDialog.editing) await $fetch(`/api/ipmgt/racks/${id.value}/items/${itemDialog.editing.id}`, { method: 'PUT', body })
    else await $fetch(`/api/ipmgt/racks/${id.value}/items`, { method: 'POST', body })
    toast.add({ title: itemDialog.editing ? 'Item updated' : 'Item placed', color: 'primary', icon: 'i-lucide-check' })
    itemDialog.open = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { savingItem.value = false }
}
async function deleteItem() {
  if (!itemDialog.editing) return
  try {
    await $fetch(`/api/ipmgt/racks/${id.value}/items/${itemDialog.editing.id}`, { method: 'DELETE' })
    toast.add({ title: 'Item removed', color: 'primary', icon: 'i-lucide-check' })
    itemDialog.open = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Remove failed', description: e?.data?.statusMessage, color: 'error' }) }
}

function itemColor(item: any) {
  if (item.color) return { backgroundColor: item.color }
  return {}
}
const TYPE_ICON: Record<string, string> = { device: 'i-lucide-server', 'patch-panel': 'i-lucide-git-commit-horizontal', pdu: 'i-lucide-plug', shelf: 'i-lucide-inbox', chassis: 'i-lucide-box', blank: 'i-lucide-minus', other: 'i-lucide-square' }
</script>

<template>
  <div>
    <PageHeader :title="rack?.name || 'Rack'" :subtitle="rack ? `${rack.size_u}U · ${rack.location_name || 'No location'}` : 'Rack elevation'" icon="i-lucide-server-cog">
      <template v-if="hasApp('ipmgt')" #actions>
        <UButtonGroup>
          <UButton :variant="side === 'front' ? 'solid' : 'soft'" size="sm" @click="side = 'front'">Front</UButton>
          <UButton :variant="side === 'rear' ? 'solid' : 'soft'" size="sm" @click="side = 'rear'">Rear</UButton>
        </UButtonGroup>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <DataState v-else :status="status" :error="error">
      <div v-if="rack" class="space-y-4">
        <NuxtLink to="/ipmgt/racks" class="inline-flex items-center gap-1 text-xs text-faint hover:text-beacon"><UIcon name="i-lucide-arrow-left" class="size-3.5" /> Back to racks</NuxtLink>

        <div class="panel overflow-hidden">
          <div v-for="r in rows" :key="`${side}-${r.u}`" class="flex border-b border-surface last:border-b-0">
            <div class="w-12 shrink-0 border-r border-surface bg-surface-2 px-2 py-1 text-right text-[10px] text-faint" :style="{ minHeight: `${r.span * 28}px` }">U{{ r.u }}</div>
            <button
              v-if="!r.item"
              class="flex flex-1 items-center px-3 text-xs text-faint hover:bg-surface-2/60"
              style="min-height: 28px"
              :disabled="!canCreate"
              @click="canCreate && openAddItem(r.u)"
            >
              <UIcon v-if="canCreate" name="i-lucide-plus" class="mr-1 size-3" /> empty
            </button>
            <button
              v-else
              class="flex flex-1 items-center gap-2 px-3 text-xs text-white hover:brightness-110"
              :style="{ minHeight: `${r.span * 28}px`, backgroundColor: r.item.color || '#3b4252' }"
              @click="canUpdate && openEditItem(r.item)"
            >
              <UIcon :name="TYPE_ICON[r.item.item_type] || 'i-lucide-square'" class="size-3.5 shrink-0" />
              <span class="truncate font-medium">{{ r.item.name }}</span>
              <span v-if="r.item.device_hostname" class="truncate text-white/70">({{ r.item.device_hostname }})</span>
              <span class="ml-auto text-white/60">{{ r.span }}U</span>
            </button>
          </div>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="itemDialog.open" :title="itemDialog.editing ? 'Edit rack item' : 'Add rack item'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="itemForm.name" placeholder="core-switch-01" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Type">
              <USelect v-model="itemForm.item_type" :items="ITEM_TYPE_ITEMS" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="Linked device">
              <USelect v-model="itemForm.device_id" :items="deviceItems" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="Position (U)" required>
              <UInput v-model.number="itemForm.position_u" type="number" class="w-full" />
            </UFormField>
            <UFormField label="Height (U)" required>
              <UInput v-model.number="itemForm.height_u" type="number" min="1" class="w-full" />
            </UFormField>
            <UFormField label="Side">
              <USelect v-model="itemForm.side" :items="[{ value: 'front', label: 'Front' }, { value: 'rear', label: 'Rear' }]" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Color (optional)">
            <UInput v-model="itemForm.color" type="color" class="h-9 w-20" />
          </UFormField>
          <UFormField label="Notes">
            <UTextarea v-model="itemForm.notes" class="w-full" :rows="2" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between gap-3">
          <UButton v-if="itemDialog.editing && canDelete" color="error" variant="ghost" icon="i-lucide-trash-2" @click="deleteItem">Remove</UButton>
          <div class="ml-auto flex gap-3">
            <UButton variant="ghost" @click="itemDialog.open = false">Cancel</UButton>
            <UButton color="primary" :loading="savingItem" :disabled="!itemForm.name.trim()" @click="saveItem">{{ itemDialog.editing ? 'Save' : 'Place' }}</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
