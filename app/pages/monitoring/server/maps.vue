<script setup lang="ts">
// Zabbix-style network map editor: place host nodes on a canvas, drag to
// position, draw links, and see live availability colouring. Layout persists to
// server_maps. "Move" mode drags nodes; "Link" mode connects two nodes.
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const { data: maps, refresh: refreshMaps } = useAsyncData('serverMaps', () => $fetch<any[]>('/api/server/maps'), { default: () => [], server: false })
const { data: hosts, refresh: refreshHosts } = useAsyncData('serverMapHosts', () => $fetch<any[]>('/api/server/hosts'), { default: () => [], server: false })

const hostById = computed(() => new Map((hosts.value || []).map((h) => [h.id, h])))
const hostItems = computed(() => (hosts.value || []).map((h) => ({ value: h.id, label: h.name })))

// ── Selected map + editable layout ───────────────────────────────────────────
const selectedId = ref<string | null>(null)
const mapName = ref('')
const nodes = ref<any[]>([])
const links = ref<{ from: string; to: string }[]>([])
const dirty = ref(false)

async function loadMap(id: string) {
  selectedId.value = id
  const m = await $fetch<any>(`/api/server/maps/${id}`)
  mapName.value = m.name
  nodes.value = (m.config?.nodes || []).map((n: any) => ({ ...n }))
  links.value = (m.config?.links || []).map((l: any) => ({ ...l }))
  dirty.value = false
}
onMounted(async () => {
  await refreshMaps()
  if (maps.value?.length) await loadMap(maps.value[0].id)
  const t = setInterval(refreshHosts, 15000)
  onUnmounted(() => clearInterval(t))
})

// ── Create / delete maps ─────────────────────────────────────────────────────
const createOpen = ref(false)
const newName = ref('')
async function createMap() {
  if (!newName.value.trim()) return
  const { id } = await $fetch<{ id: string }>('/api/server/maps', { method: 'POST', body: { name: newName.value } })
  createOpen.value = false; newName.value = ''
  await refreshMaps(); await loadMap(id)
}
async function deleteMap() {
  if (!selectedId.value || !confirm(`Delete map "${mapName.value}"?`)) return
  await $fetch(`/api/server/maps/${selectedId.value}`, { method: 'DELETE' })
  selectedId.value = null; nodes.value = []; links.value = []
  await refreshMaps()
  if (maps.value?.length) await loadMap(maps.value[0].id)
}
async function save() {
  if (!selectedId.value) return
  await $fetch(`/api/server/maps/${selectedId.value}`, { method: 'PUT', body: { name: mapName.value, config: { nodes: nodes.value, links: links.value } } })
  dirty.value = false
  toast.add({ title: 'Map saved', color: 'primary', icon: 'i-lucide-check' })
  await refreshMaps()
}

// ── Editing: add / remove nodes + links ──────────────────────────────────────
const addHostId = ref('')
function addNode() {
  if (!addHostId.value) return
  const h = hostById.value.get(addHostId.value)
  const n = nodes.value.length
  nodes.value.push({ id: `n${Date.now()}`, host_id: addHostId.value, label: h?.name || 'host', x: 40 + (n % 6) * 180, y: 40 + Math.floor(n / 6) * 110 })
  addHostId.value = ''; dirty.value = true
}
function addAllHosts() {
  const present = new Set(nodes.value.filter((n) => n.host_id).map((n) => n.host_id))
  for (const h of hosts.value || []) {
    if (present.has(h.id)) continue
    const n = nodes.value.length
    nodes.value.push({ id: `n${Date.now()}_${n}`, host_id: h.id, label: h.name, x: 40 + (n % 6) * 180, y: 40 + Math.floor(n / 6) * 110 })
  }
  dirty.value = true
}
function removeNode(id: string) {
  nodes.value = nodes.value.filter((n) => n.id !== id)
  links.value = links.value.filter((l) => l.from !== id && l.to !== id)
  if (pendingLink.value === id) pendingLink.value = null
  dirty.value = true
}
function removeLink(i: number) { links.value.splice(i, 1); dirty.value = true }

// ── Modes: move (drag) vs link (connect) ─────────────────────────────────────
const mode = ref<'move' | 'link'>('move')
const pendingLink = ref<string | null>(null)
const canvas = ref<HTMLElement | null>(null)
const NODE_W = 150, NODE_H = 52

function center(n: any) { return { x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 } }

let dragId: string | null = null
let dragOff = { x: 0, y: 0 }
function onNodePointerDown(e: PointerEvent, n: any) {
  if (!canManage.value) return
  if (mode.value === 'link') {
    if (!pendingLink.value) { pendingLink.value = n.id }
    else if (pendingLink.value !== n.id) {
      const exists = links.value.some((l) => (l.from === pendingLink.value && l.to === n.id) || (l.from === n.id && l.to === pendingLink.value))
      if (!exists) { links.value.push({ from: pendingLink.value, to: n.id }); dirty.value = true }
      pendingLink.value = null
    }
    return
  }
  dragId = n.id
  const rect = canvas.value!.getBoundingClientRect()
  dragOff = { x: e.clientX - rect.left - n.x, y: e.clientY - rect.top - n.y }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}
function onPointerMove(e: PointerEvent) {
  if (!dragId || !canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  const n = nodes.value.find((x) => x.id === dragId)
  if (!n) return
  n.x = Math.max(0, Math.min(rect.width - NODE_W, e.clientX - rect.left - dragOff.x))
  n.y = Math.max(0, Math.min(rect.height - NODE_H, e.clientY - rect.top - dragOff.y))
  dirty.value = true
}
function onPointerUp() {
  dragId = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

function nodeColor(n: any) {
  const h = n.host_id ? hostById.value.get(n.host_id) : null
  if (!h) return { ring: 'ring-hull', dot: 'bg-slate-400', bg: 'bg-surface-2' }
  if (h.monitoring_enabled === false) return { ring: 'ring-slate-500/40', dot: 'bg-slate-500', bg: 'bg-slate-500/10' }
  if (h.problem_count > 0 || h.availability === 'unavailable') return { ring: 'ring-red-500/50', dot: 'bg-red-500', bg: 'bg-red-500/10' }
  if (h.availability === 'available') return { ring: 'ring-green-500/40', dot: 'bg-green-500', bg: 'bg-green-500/10' }
  return { ring: 'ring-hull', dot: 'bg-slate-400', bg: 'bg-surface-2' }
}
</script>

<template>
  <div>
    <PageHeader title="Maps" subtitle="Interactive network map with live host status" icon="i-lucide-map">
      <template v-if="hasApp('monitoring') && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" color="neutral" variant="soft" @click="createOpen = true">New map</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <div v-else-if="!maps.length" class="panel p-10 text-center text-faint text-sm">
      No maps yet. <UButton v-if="canManage" size="xs" class="ml-1" @click="createOpen = true">Create one</UButton>
    </div>

    <div v-else class="space-y-3">
      <!-- Toolbar -->
      <div class="panel p-3 flex flex-wrap items-center gap-2">
        <USelect v-model="selectedId" :items="maps.map((m: any) => ({ value: m.id, label: m.name }))" value-key="value" label-key="label" size="sm" class="w-48" @update:model-value="(v: string) => loadMap(v)" />
        <template v-if="canManage">
          <div class="h-5 w-px bg-hull mx-1"></div>
          <UButtonGroup size="sm">
            <UButton :color="mode === 'move' ? 'primary' : 'neutral'" :variant="mode === 'move' ? 'solid' : 'soft'" icon="i-lucide-move" @click="mode = 'move'; pendingLink = null">Move</UButton>
            <UButton :color="mode === 'link' ? 'primary' : 'neutral'" :variant="mode === 'link' ? 'solid' : 'soft'" icon="i-lucide-spline" @click="mode = 'link'">Link</UButton>
          </UButtonGroup>
          <USelect v-model="addHostId" :items="hostItems" value-key="value" label-key="label" size="sm" class="w-40" placeholder="Add host…" @update:model-value="addNode" />
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-layout-grid" @click="addAllHosts">Add all</UButton>
          <div class="ml-auto flex items-center gap-2">
            <span v-if="mode === 'link'" class="text-xs text-faint">{{ pendingLink ? 'Click a target node…' : 'Click a source node…' }}</span>
            <span v-if="dirty" class="text-xs text-amber-500">Unsaved</span>
            <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" @click="deleteMap">Delete</UButton>
            <UButton size="sm" color="primary" icon="i-lucide-save" :disabled="!dirty" @click="save">Save</UButton>
          </div>
        </template>
      </div>

      <!-- Canvas -->
      <div ref="canvas" class="panel relative overflow-hidden" style="height: 620px;" :class="mode === 'link' ? 'cursor-crosshair' : ''">
        <svg class="absolute inset-0 w-full h-full pointer-events-none">
          <line v-for="(l, i) in links" :key="i"
                :x1="center(nodes.find(n => n.id === l.from) || { x: 0, y: 0 }).x"
                :y1="center(nodes.find(n => n.id === l.from) || { x: 0, y: 0 }).y"
                :x2="center(nodes.find(n => n.id === l.to) || { x: 0, y: 0 }).x"
                :y2="center(nodes.find(n => n.id === l.to) || { x: 0, y: 0 }).y"
                stroke="#64748b" stroke-width="2"
                class="pointer-events-auto cursor-pointer hover:stroke-red-500"
                @click="canManage && removeLink(i)" />
        </svg>

        <div v-for="n in nodes" :key="n.id"
             class="absolute select-none rounded-lg ring-1 p-2 shadow group"
             :class="[nodeColor(n).ring, nodeColor(n).bg, mode === 'move' && canManage ? 'cursor-grab active:cursor-grabbing' : '', pendingLink === n.id ? 'ring-2 ring-beacon' : '']"
             :style="{ left: n.x + 'px', top: n.y + 'px', width: NODE_W + 'px' }"
             @pointerdown="onNodePointerDown($event, n)">
          <div class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-full shrink-0" :class="nodeColor(n).dot"></span>
            <NuxtLink v-if="n.host_id" :to="`/monitoring/server/hosts/${n.host_id}`" class="text-xs font-medium text-foam truncate hover:text-beacon" @pointerdown.stop @click.stop>{{ n.label }}</NuxtLink>
            <span v-else class="text-xs font-medium text-foam truncate">{{ n.label }}</span>
            <UButton v-if="canManage" size="xs" variant="ghost" color="error" icon="i-lucide-x" class="ml-auto opacity-0 group-hover:opacity-100 -mr-1" @pointerdown.stop @click.stop="removeNode(n.id)" />
          </div>
          <div v-if="n.host_id && hostById.get(n.host_id)" class="mt-0.5 font-mono text-[10px] text-faint truncate">{{ hostById.get(n.host_id).ip }}</div>
        </div>

        <div v-if="!nodes.length" class="absolute inset-0 flex items-center justify-center text-sm text-faint">
          Empty map — add hosts from the toolbar.
        </div>
      </div>
    </div>

    <UModal v-model:open="createOpen" title="New map">
      <template #body>
        <UFormField label="Name" required><UInput v-model="newName" class="w-full" placeholder="Data centre" @keyup.enter="createMap" /></UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="createOpen = false">Cancel</UButton>
          <UButton color="primary" @click="createMap">Create</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
