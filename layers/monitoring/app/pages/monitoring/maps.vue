<script setup lang="ts">
// Unified Maps: the Network module's distributed-site world view + wallboard,
// and the Server module's interactive topology editor, in ONE page as tabs —
// no separate Network/Server maps. The topology canvas is generalized so a
// single map can mix Network device nodes and Server host nodes; each node
// simply carries a `type` (device|host) instead of living on separate pages.
const { hasApp, hasPermission } = useAuth()
const toast = useToast()
const canManage = computed(() => hasPermission('monitoring.manage'))

const tabs = [
  { label: 'Topology', icon: 'i-lucide-spline', slot: 'topology' as const },
  { label: 'World view', icon: 'i-lucide-globe', slot: 'world' as const }
]

// ── Shared data: devices + hosts, used by both tabs ─────────────────────────
const { data: devices, refresh: refreshDevices } = useAsyncData('mapsDevices', () => $fetch<any[]>('/api/net/devices'), { default: () => [], server: false })
const { data: hosts, refresh: refreshHosts } = useAsyncData('mapsHosts', () => $fetch<any[]>('/api/server/hosts'), { default: () => [], server: false })
const { data: probes, refresh: refreshProbes } = useAsyncData('mapsProbes', () => $fetch<any[]>('/api/net/probes'), { default: () => [], server: false })

const deviceById = computed(() => new Map((devices.value || []).map((d: any) => [d.id, d])))
const hostById = computed(() => new Map((hosts.value || []).map((h: any) => [h.id, h])))

onMounted(() => {
  const t = setInterval(() => { refreshDevices(); refreshHosts(); refreshProbes() }, 15000)
  onUnmounted(() => clearInterval(t))
})

// ═══════════════════════════════════════════════════════════════════════════
// Topology tab: drag-canvas editor with mixed device/host nodes
// ═══════════════════════════════════════════════════════════════════════════
const { data: maps, refresh: refreshMaps } = useAsyncData('unifiedMaps', () => $fetch<any[]>('/api/server/maps'), { default: () => [], server: false })

const selectedId = ref<string | null>(null)
const mapName = ref('')
const nodes = ref<any[]>([])
const links = ref<{ from: string; to: string }[]>([])
const dirty = ref(false)

// Normalize legacy rows (pre-merge maps only ever held server hosts via host_id).
function normalizeNode(n: any) {
  const type = n.type === 'device' ? 'device' : 'host'
  const ref_id = n.ref_id != null ? n.ref_id : (n.host_id != null ? n.host_id : null)
  return { ...n, type, ref_id }
}

async function loadMap(id: string) {
  selectedId.value = id
  const m = await $fetch<any>(`/api/server/maps/${id}`)
  mapName.value = m.name
  nodes.value = (m.config?.nodes || []).map(normalizeNode)
  links.value = (m.config?.links || []).map((l: any) => ({ ...l }))
  dirty.value = false
}
onMounted(async () => {
  await refreshMaps()
  if (maps.value?.length) await loadMap(maps.value[0].id)
})

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
async function saveMap() {
  if (!selectedId.value) return
  await $fetch(`/api/server/maps/${selectedId.value}`, { method: 'PUT', body: { name: mapName.value, config: { nodes: nodes.value, links: links.value } } })
  dirty.value = false
  toast.add({ title: 'Map saved', color: 'primary', icon: 'i-lucide-check' })
  await refreshMaps()
}

const addDeviceId = ref('')
const addHostId = ref('')
const deviceItems = computed(() => (devices.value || []).map((d: any) => ({ value: d.id, label: d.hostname })))
const hostItems = computed(() => (hosts.value || []).map((h: any) => ({ value: h.id, label: h.name })))

function nextPos() {
  const n = nodes.value.length
  return { x: 40 + (n % 6) * 180, y: 40 + Math.floor(n / 6) * 110 }
}
function addNode(type: 'device' | 'host', refId: string, label: string) {
  nodes.value.push({ id: `n${Date.now()}_${nodes.value.length}`, type, ref_id: refId, label, ...nextPos() })
  dirty.value = true
}
function addSelectedDevice() { if (!addDeviceId.value) return; const d = deviceById.value.get(addDeviceId.value); addNode('device', addDeviceId.value, d?.hostname || 'device'); addDeviceId.value = '' }
function addSelectedHost() { if (!addHostId.value) return; const h = hostById.value.get(addHostId.value); addNode('host', addHostId.value, h?.name || 'host'); addHostId.value = '' }
function addAll() {
  const present = new Set(nodes.value.map((n) => `${n.type}:${n.ref_id}`))
  for (const d of devices.value || []) { if (!present.has(`device:${d.id}`)) addNode('device', d.id, d.hostname) }
  for (const h of hosts.value || []) { if (!present.has(`host:${h.id}`)) addNode('host', h.id, h.name) }
}
function removeNode(id: string) {
  nodes.value = nodes.value.filter((n) => n.id !== id)
  links.value = links.value.filter((l) => l.from !== id && l.to !== id)
  if (pendingLink.value === id) pendingLink.value = null
  dirty.value = true
}
function removeLink(i: number) { links.value.splice(i, 1); dirty.value = true }

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

function nodeEntity(n: any) { return n.type === 'device' ? deviceById.value.get(n.ref_id) : hostById.value.get(n.ref_id) }
function nodeUp(n: any): boolean | null {
  const e = nodeEntity(n)
  if (!e) return null
  return n.type === 'device' ? e.status === 'up' : e.availability === 'available'
}
function nodeColor(n: any) {
  const e = nodeEntity(n)
  if (!e) return { ring: 'ring-hull', dot: 'bg-slate-400', bg: 'bg-surface-2' }
  const paused = n.type === 'device' ? e.status === 'paused' : e.monitoring_enabled === false
  if (paused) return { ring: 'ring-slate-500/40', dot: 'bg-slate-500', bg: 'bg-slate-500/10' }
  const hasProblem = n.type === 'host' && e.problem_count > 0
  if (hasProblem || nodeUp(n) === false) return { ring: 'ring-red-500/50', dot: 'bg-red-500', bg: 'bg-red-500/10' }
  if (nodeUp(n) === true) return { ring: 'ring-green-500/40', dot: 'bg-green-500', bg: 'bg-green-500/10' }
  return { ring: 'ring-hull', dot: 'bg-slate-400', bg: 'bg-surface-2' }
}
function nodeAddress(n: any) { const e = nodeEntity(n); return e ? (n.type === 'device' ? e.ip : e.ip) : '' }
function nodeLink(n: any) { return n.type === 'device' ? `/monitoring/network/devices/${n.ref_id}` : `/monitoring/server/hosts/${n.ref_id}` }

// ═══════════════════════════════════════════════════════════════════════════
// World view tab: distributed probe sites + a combined status wallboard
// ═══════════════════════════════════════════════════════════════════════════
function project(lat: number, lng: number) {
  return { left: ((Number(lng) + 180) / 360) * 100, top: ((90 - Number(lat)) / 180) * 100 }
}
const sites = computed(() =>
  (probes.value || [])
    .filter((p: any) => p.latitude != null && p.longitude != null)
    .map((p: any) => ({ ...p, pos: project(p.latitude, p.longitude) }))
)

// One combined wallboard: Network devices + Server hosts, each tagged by type.
const wallboard = computed(() => {
  const netCards = (devices.value || []).map((d: any) => ({ type: 'device', id: d.id, name: d.hostname, up: d.status === 'up', category: d.category, to: `/monitoring/network/devices/${d.id}` }))
  const srvCards = (hosts.value || []).map((h: any) => ({ type: 'host', id: h.id, name: h.name, up: h.availability === 'available', category: null, to: `/monitoring/server/hosts/${h.id}` }))
  return [...netCards, ...srvCards]
})
const wallboardStats = computed(() => ({
  total: wallboard.value.length,
  up: wallboard.value.filter((c) => c.up).length,
  down: wallboard.value.filter((c) => !c.up).length
}))
function cardIcon(c: any) {
  if (c.type === 'host') return 'i-lucide-server-cog'
  return c.category === 'network' ? 'i-lucide-network' : c.category === 'storage' ? 'i-lucide-database' : c.category === 'iot' ? 'i-lucide-cpu' : 'i-lucide-server'
}
</script>

<template>
  <div>
    <PageHeader title="Maps" subtitle="Network + Server topology, status wallboard, and distributed sites" icon="i-lucide-map">
      <template v-if="hasApp('monitoring') && canManage" #actions>
        <UButton icon="i-lucide-plus" size="sm" color="neutral" variant="soft" @click="createOpen = true">New map</UButton>
      </template>
    </PageHeader>

    <div v-if="!hasApp('monitoring')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-Monitoring.</p>
    </div>

    <UTabs v-else :items="tabs" variant="link" :unmount-on-hide="false">
      <!-- ── Topology ──────────────────────────────────────────────────── -->
      <template #topology>
        <div class="pt-4">
          <div v-if="!maps.length" class="panel p-10 text-center text-faint text-sm">
            No maps yet. <UButton v-if="canManage" size="xs" class="ml-1" @click="createOpen = true">Create one</UButton>
          </div>

          <div v-else class="space-y-3">
            <div class="panel p-3 flex flex-wrap items-center gap-2">
              <USelect v-model="selectedId" :items="maps.map((m: any) => ({ value: m.id, label: m.name }))" value-key="value" label-key="label" size="sm" class="w-48" @update:model-value="(v: string) => loadMap(v)" />
              <template v-if="canManage">
                <div class="h-5 w-px bg-hull mx-1"></div>
                <UButtonGroup size="sm">
                  <UButton :color="mode === 'move' ? 'primary' : 'neutral'" :variant="mode === 'move' ? 'solid' : 'soft'" icon="i-lucide-move" @click="mode = 'move'; pendingLink = null">Move</UButton>
                  <UButton :color="mode === 'link' ? 'primary' : 'neutral'" :variant="mode === 'link' ? 'solid' : 'soft'" icon="i-lucide-spline" @click="mode = 'link'">Link</UButton>
                </UButtonGroup>
                <USelect v-model="addDeviceId" :items="deviceItems" value-key="value" label-key="label" size="sm" class="w-36" placeholder="Add device…" @update:model-value="addSelectedDevice" />
                <USelect v-model="addHostId" :items="hostItems" value-key="value" label-key="label" size="sm" class="w-36" placeholder="Add host…" @update:model-value="addSelectedHost" />
                <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-layout-grid" @click="addAll">Add all</UButton>
                <div class="ml-auto flex items-center gap-2">
                  <span v-if="mode === 'link'" class="text-xs text-faint">{{ pendingLink ? 'Click a target node…' : 'Click a source node…' }}</span>
                  <span v-if="dirty" class="text-xs text-amber-500">Unsaved</span>
                  <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" @click="deleteMap">Delete</UButton>
                  <UButton size="sm" color="primary" icon="i-lucide-save" :disabled="!dirty" @click="saveMap">Save</UButton>
                </div>
              </template>
            </div>

            <div ref="canvas" class="panel relative overflow-hidden" style="height: 560px;" :class="mode === 'link' ? 'cursor-crosshair' : ''">
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
                  <NuxtLink :to="nodeLink(n)" class="text-xs font-medium text-foam truncate hover:text-beacon" @pointerdown.stop @click.stop>{{ n.label }}</NuxtLink>
                  <UButton v-if="canManage" size="xs" variant="ghost" color="error" icon="i-lucide-x" class="ml-auto opacity-0 group-hover:opacity-100 -mr-1" @pointerdown.stop @click.stop="removeNode(n.id)" />
                </div>
                <div class="mt-0.5 flex items-center gap-1">
                  <UBadge :color="n.type === 'device' ? 'info' : 'primary'" variant="subtle" size="xs" class="capitalize">{{ n.type }}</UBadge>
                  <span class="font-mono text-[10px] text-faint truncate">{{ nodeAddress(n) }}</span>
                </div>
              </div>

              <div v-if="!nodes.length" class="absolute inset-0 flex items-center justify-center text-sm text-faint">
                Empty map — add devices or hosts from the toolbar.
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ── World view ────────────────────────────────────────────────── -->
      <template #world>
        <div class="pt-4 space-y-6">
          <div class="panel p-5">
            <div class="flex items-center justify-between mb-4">
              <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Distributed Sites</h2>
              <div class="flex items-center gap-4 text-xs text-faint">
                <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-green-500"></span> Connected</span>
                <span class="flex items-center gap-1.5"><span class="size-2 rounded-full bg-red-500"></span> Disconnected</span>
              </div>
            </div>

            <div
              class="relative w-full overflow-hidden rounded-xl border border-surface bg-surface-2"
              style="aspect-ratio: 2 / 1; background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px); background-size: 24px 24px;"
            >
              <div class="absolute inset-x-0 top-1/2 border-t border-dashed border-white/5"></div>
              <div class="absolute inset-y-0 left-1/2 border-l border-dashed border-white/5"></div>

              <div v-for="site in sites" :key="site.id" class="absolute -translate-x-1/2 -translate-y-1/2 group" :style="{ left: site.pos.left + '%', top: site.pos.top + '%' }">
                <span class="relative flex size-3.5">
                  <span v-if="site.status === 'connected'" class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" :class="site.devices_down ? 'bg-orange-500' : 'bg-green-500'"></span>
                  <span class="relative inline-flex size-3.5 rounded-full ring-2 ring-ink" :class="site.status !== 'connected' ? 'bg-red-500' : site.devices_down ? 'bg-orange-500' : 'bg-green-500'"></span>
                </span>
                <div class="pointer-events-none absolute left-1/2 top-5 z-10 hidden w-44 -translate-x-1/2 rounded-lg border border-hull bg-ink/95 p-3 text-left shadow-lg backdrop-blur group-hover:block">
                  <p class="text-xs font-semibold text-foam truncate">{{ site.name }}</p>
                  <p class="text-[11px] text-faint">{{ site.location }}</p>
                  <div class="mt-2 flex items-center justify-between text-[11px]">
                    <span class="text-green-500">{{ site.devices_up }} up</span>
                    <span class="text-red-500">{{ site.devices_down }} down</span>
                    <span class="text-(--color-muted)">{{ site.sensor_count }} sensors</span>
                  </div>
                </div>
                <span class="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-(--color-muted) group-hover:opacity-0">{{ site.location?.split(',')[0] }}</span>
              </div>
            </div>
          </div>

          <div class="panel p-5">
            <div class="flex items-center justify-between mb-4">
              <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Status Wallboard</h2>
              <div class="flex items-center gap-3 text-xs">
                <span class="text-green-500 font-medium">{{ wallboardStats.up }} up</span>
                <span class="text-red-500 font-medium">{{ wallboardStats.down }} down</span>
                <span class="text-faint">/ {{ wallboardStats.total }}</span>
              </div>
            </div>
            <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              <NuxtLink
                v-for="c in wallboard" :key="`${c.type}:${c.id}`" :to="c.to"
                class="relative flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 transition aspect-square"
                :class="c.up ? 'border-green-500/20 bg-green-500/5 hover:border-green-500/50' : 'border-red-500/20 bg-red-500/5 hover:border-red-500/50'"
              >
                <UBadge :color="c.type === 'device' ? 'info' : 'primary'" variant="subtle" size="xs" class="absolute top-1 right-1 !px-1 !py-0 text-[9px]">{{ c.type === 'device' ? 'N' : 'S' }}</UBadge>
                <UIcon :name="cardIcon(c)" class="size-6" :class="c.up ? 'text-green-500' : 'text-red-500'" />
                <span class="text-[10px] font-medium text-foam text-center truncate w-full">{{ c.name }}</span>
              </NuxtLink>
            </div>
          </div>
        </div>
      </template>
    </UTabs>

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
