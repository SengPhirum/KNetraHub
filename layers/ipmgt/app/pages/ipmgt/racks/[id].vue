<script setup lang="ts">
// Rack detail: facts panel (name, size, location, placed devices) beside a
// visual rack diagram - front [F] and rear [R] elevations rendered side by
// side with U-number rails, like a physical cabinet. Click an empty U to
// place something there; click a placed item to edit or remove it. "Add
// device" / "Add custom equipment" place at the first free U.
const route = useRoute()
const toast = useToast()
const { hasApp } = useAuth()
const { canCreate, canUpdate, canDelete } = useIpam()
const id = computed(() => route.params.id as string)

const { data: rack, status, error, refresh } = useAsyncData('ipamRackDetail', () => $fetch<any>(`/api/ipmgt/racks/${id.value}`), { server: false, default: () => null, watch: [id] })
const { data: devices } = useAsyncData('ipamRefDevicesForRack', () => $fetch<any[]>('/api/ipmgt/devices'), { server: false, default: () => [] })
const deviceItems = computed(() => [{ value: '', label: '— None (passive item) —' }, ...(devices.value || []).map((d: any) => ({ value: d.id, label: d.hostname }))])

/** Height of one rack unit in the diagram, px. */
const ROW_H = 24

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

// Rows for one side: merged item spans + empty single-U rows, in display order, skipping U's covered by a preceding span.
function buildRows(side: 'front' | 'rear') {
  if (!rack.value) return []
  const items = (rack.value.items || []).filter((i: any) => i.side === side)
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
}
const sides = computed(() => [
  { key: 'front' as const, tag: 'F', rows: buildRows('front') },
  { key: 'rear' as const, tag: 'R', rows: buildRows('rear') }
])

/** Lowest free U on a side (for the Add device / Add custom equipment buttons). */
function firstFreeU(side: 'front' | 'rear'): number {
  if (!rack.value) return 1
  const covered = new Set<number>()
  for (const i of (rack.value.items || []).filter((x: any) => x.side === side)) {
    for (let u = i.position_u; u < i.position_u + i.height_u; u++) covered.add(u)
  }
  for (let u = rack.value.starting_unit; u <= rack.value.starting_unit + rack.value.size_u - 1; u++) {
    if (!covered.has(u)) return u
  }
  return rack.value.starting_unit
}

const itemDialog = reactive({ open: false, editing: null as any })
const itemForm = reactive({ name: '', item_type: 'device', device_id: '', position_u: 1, height_u: 1, side: 'front', color: '', notes: '' })
const savingItem = ref(false)
function openAddItem(u: number, side: 'front' | 'rear' = 'front', itemType = 'device') {
  itemDialog.editing = null
  Object.assign(itemForm, { name: '', item_type: itemType, device_id: '', position_u: u, height_u: 1, side, color: '', notes: '' })
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

const TYPE_ICON: Record<string, string> = { device: 'i-lucide-server', 'patch-panel': 'i-lucide-git-commit-horizontal', pdu: 'i-lucide-plug', shelf: 'i-lucide-inbox', chassis: 'i-lucide-box', blank: 'i-lucide-minus', other: 'i-lucide-square' }
</script>

<template>
  <div>
    <PageHeader :title="rack?.name || 'Rack'" :subtitle="rack ? `${rack.size_u}U · ${rack.location_name || 'No location'}` : 'Rack elevation'" icon="i-lucide-server-cog">
      <template v-if="hasApp('ipmgt') && rack && canCreate" #actions>
        <div class="flex flex-wrap items-center gap-2">
          <UButton size="sm" icon="i-lucide-server" @click="openAddItem(firstFreeU('front'), 'front', 'device')">Add device</UButton>
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-wrench" @click="openAddItem(firstFreeU('front'), 'front', 'other')">Add custom equipment</UButton>
        </div>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <DataState v-else :status="status" :error="error">
      <div v-if="rack" class="space-y-4">
        <NuxtLink to="/ipmgt/racks" class="inline-flex items-center gap-1 text-xs text-faint hover:text-beacon"><UIcon name="i-lucide-arrow-left" class="size-3.5" /> Back to racks</NuxtLink>

        <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_auto]">
          <!-- Facts + placed devices -->
          <section class="panel p-5">
            <h2 class="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Rack details</h2>
            <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt class="text-faint">Name</dt><dd class="text-foam">{{ rack.name }}</dd>
              <dt class="text-faint">Size</dt><dd class="text-foam">{{ rack.size_u }} U</dd>
              <dt class="text-faint">Description</dt><dd class="text-(--color-muted)">{{ rack.description || '—' }}</dd>
              <dt class="text-faint">Location</dt><dd class="text-(--color-muted)">{{ rack.location_name || '—' }}<span v-if="rack.room"> · {{ rack.room }}</span><span v-if="rack.row_name"> · Row {{ rack.row_name }}</span></dd>
            </dl>

            <div class="mt-5 border-t border-surface pt-4">
              <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Devices</h3>
              <p v-if="!rack.items?.length" class="text-sm italic text-faint">Rack is empty</p>
              <ul v-else class="space-y-1.5">
                <li v-for="i in rack.items" :key="i.id" class="flex items-center gap-2 text-sm">
                  <UIcon :name="TYPE_ICON[i.item_type] || 'i-lucide-square'" class="size-3.5 shrink-0 text-faint" />
                  <button class="truncate text-foam hover:text-beacon" @click="canUpdate && openEditItem(i)">{{ i.name }}</button>
                  <span v-if="i.device_hostname" class="truncate text-xs text-faint">({{ i.device_hostname }})</span>
                  <span class="ml-auto shrink-0 font-mono text-xs text-faint">{{ i.side === 'rear' ? 'R' : 'F' }} · U{{ i.position_u }}<template v-if="i.height_u > 1">–{{ i.position_u + i.height_u - 1 }}</template></span>
                </li>
              </ul>
              <div v-if="canCreate" class="mt-3 flex flex-wrap gap-2">
                <UButton size="xs" variant="soft" icon="i-lucide-plus" @click="openAddItem(firstFreeU('front'), 'front', 'device')">Add device</UButton>
                <UButton size="xs" variant="soft" color="neutral" icon="i-lucide-plus" @click="openAddItem(firstFreeU('front'), 'front', 'other')">Add custom equipment</UButton>
              </div>
            </div>

            <div class="mt-5 rounded-md border border-surface bg-surface-2/40 p-3 text-xs text-(--color-muted)">
              <p class="mb-1.5 flex items-center gap-1.5 font-semibold text-foam"><UIcon name="i-lucide-info" class="size-3.5" /> How to use this rack</p>
              <ul class="list-inside list-disc space-y-1">
                <li><span class="text-foam">Add device</span> — place a rack unit linked to a device from your Devices inventory.</li>
                <li><span class="text-foam">Add custom equipment</span> — place anything else: patch panel, PDU, shelf, chassis, blank panel…</li>
                <li>Click an <span class="text-foam">empty slot</span> in the [F] front / [R] rear diagram to place equipment at that exact U.</li>
                <li>Click a <span class="text-foam">placed item</span> (in the diagram or the Devices list) to edit, move, resize, recolor, or remove it.</li>
                <li>Front and rear are separate faces — choose the side in the dialog; multi-U items set <span class="text-foam">Height (U)</span>.</li>
              </ul>
            </div>
          </section>

          <!-- Rack diagram: front + rear elevations -->
          <section class="flex flex-wrap justify-center gap-6 xl:justify-end">
            <div v-for="sideDef in sides" :key="sideDef.key" class="w-64 shrink-0">
              <div class="rounded-t-md border border-b-0 border-hull bg-surface-2 px-2 py-1.5 text-center font-mono text-[11px] font-semibold text-foam">[{{ sideDef.tag }}] {{ rack.name }}</div>
              <div class="flex rounded-b-md border border-hull bg-surface-2/50 p-1.5">
                <!-- Left U rail -->
                <div class="flex flex-col border-r border-hull/60 pr-1">
                  <div v-for="u in uOrder" :key="`l-${u}`" class="flex w-6 items-center justify-end pr-0.5 font-mono text-[9px] leading-none text-faint" :style="{ height: `${ROW_H}px` }">{{ u }}</div>
                </div>
                <!-- Slots -->
                <div class="flex min-w-0 flex-1 flex-col px-0.5">
                  <template v-for="r in sideDef.rows" :key="`${sideDef.key}-${r.u}`">
                    <button
                      v-if="!r.item"
                      class="group flex items-center justify-center rounded-[3px] border-b border-surface/60 bg-surface/30 text-transparent transition hover:bg-surface-2 hover:text-faint"
                      :style="{ height: `${ROW_H}px` }"
                      :disabled="!canCreate"
                      :title="`U${r.u} — empty`"
                      @click="canCreate && openAddItem(r.u, sideDef.key)"
                    >
                      <UIcon name="i-lucide-plus" class="size-3" />
                    </button>
                    <button
                      v-else
                      class="flex items-center gap-1.5 overflow-hidden rounded-[3px] border border-black/30 px-1.5 text-left text-[10px] leading-tight text-white shadow-sm transition hover:brightness-110"
                      :style="{ height: `${r.span * ROW_H}px`, backgroundColor: r.item.color || '#3b4252' }"
                      :title="`${r.item.name} · U${r.u}${r.span > 1 ? '–' + (r.u + r.span - 1) : ''}`"
                      @click="canUpdate && openEditItem(r.item)"
                    >
                      <UIcon :name="TYPE_ICON[r.item.item_type] || 'i-lucide-square'" class="size-3 shrink-0" />
                      <span class="truncate font-medium">{{ r.item.name }}</span>
                      <span class="ml-auto shrink-0 text-white/60">{{ r.span }}U</span>
                    </button>
                  </template>
                </div>
                <!-- Right U rail -->
                <div class="flex flex-col border-l border-hull/60 pl-1">
                  <div v-for="u in uOrder" :key="`r-${u}`" class="flex w-6 items-center pl-0.5 font-mono text-[9px] leading-none text-faint" :style="{ height: `${ROW_H}px` }">{{ u }}</div>
                </div>
              </div>
            </div>
          </section>
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
