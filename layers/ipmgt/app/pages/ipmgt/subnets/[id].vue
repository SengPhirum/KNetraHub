<script setup lang="ts">
// Subnet detail: facts panel, usage, visual address grid (colour-coded), and a
// defined-addresses table. Supports add / edit / release, find & reserve first
// free.
const route = useRoute()
const toast = useToast()
const { hasApp, hasPermission } = useAuth()
const { canCreate, canUpdate, canDelete, canAssign, ipStatusMeta: statusMeta } = useIpam()
const canScan = computed(() => hasPermission('ipmgt.scan'))
const id = computed(() => route.params.id as string)

const { data: subnet, status, error, refresh: refreshSubnet } = useAsyncData(
  'ipamSubnetDetail', () => $fetch<any>(`/api/ipmgt/subnets/${id.value}`), { server: false, default: () => null, watch: [id] })
const { data: grid, refresh: refreshGrid } = useAsyncData(
  'ipamSubnetGrid', () => $fetch<any>(`/api/ipmgt/subnets/${id.value}/ips`), { server: false, default: () => null, watch: [id] })

async function refreshAll() { await Promise.all([refreshSubnet(), refreshGrid()]) }

const gridFilter = ref('')
const visibleCells = computed(() => {
  const cells = grid.value?.cells || []
  const f = gridFilter.value.toLowerCase().trim()
  if (!f) return cells
  return cells.filter((c: any) => c.ip.toLowerCase().includes(f) || (c.record?.hostname || '').toLowerCase().includes(f))
})
const definedAddresses = computed(() => (grid.value?.cells || []).filter((c: any) => c.record))

// ── Address create/edit ──────────────────────────────────────────────────
const addrOpen = ref(false)
const editingAddr = ref<any>(null)
const presetIp = ref<string | null>(null)

function addAddress(ip: string | null = null) { editingAddr.value = null; presetIp.value = ip; addrOpen.value = true }
async function editAddress(recordId: string) {
  try {
    editingAddr.value = await $fetch<any>(`/api/ipmgt/addresses/${recordId}`)
    presetIp.value = null
    addrOpen.value = true
  } catch (e: any) { toast.add({ title: 'Load failed', description: e?.data?.statusMessage, color: 'error' }) }
}
function onCellClick(cell: any) {
  if (cell.record) { if (canUpdate.value) editAddress(cell.record.id) }
  else if (cell.status === 'free' && canCreate.value) addAddress(cell.ip)
}

// ── First-free / reserve ───────────────────────────────────────────────────
async function findFirstFree() {
  try {
    const { ip } = await $fetch<any>(`/api/ipmgt/subnets/${id.value}/first-free`)
    toast.add({ title: `First free: ${ip}`, color: 'primary', icon: 'i-lucide-check' })
    gridFilter.value = ip
  } catch (e: any) { toast.add({ title: 'None free', description: e?.data?.statusMessage, color: 'warning' }) }
}
async function reserveFirstFree() {
  try {
    const res = await $fetch<any>(`/api/ipmgt/subnets/${id.value}/reserve`, { method: 'POST', body: { status: 'reserved' } })
    toast.add({ title: `Reserved ${res.ip}`, color: 'primary', icon: 'i-lucide-check' })
    await refreshAll()
  } catch (e: any) { toast.add({ title: 'Reserve failed', description: e?.data?.statusMessage, color: 'error' }) }
}

// ── Scanning ─────────────────────────────────────────────────────────────
// Manual scans open a dialog: the scan reports discovered hosts (with
// reverse-DNS hostnames) and nothing is saved until the user reviews the
// list - editable hostname/description, removable rows - and confirms.
const scanning = ref(false)
const scanDialog = reactive({
  open: false,
  report: null as any,
  hosts: [] as { ip: string; hostname: string; description: string; rttMs: number | null }[]
})
const addingHosts = ref(false)
const { data: scanHistory, refresh: refreshScans } = useAsyncData(
  'ipamSubnetScans', () => $fetch<any[]>('/api/ipmgt/scans', { query: { subnet_id: id.value, limit: 5 } }), { server: false, default: () => [], watch: [id] })
async function runScan() {
  scanning.value = true
  scanDialog.report = null
  scanDialog.hosts = []
  scanDialog.open = true
  try {
    const report = await $fetch<any>(`/api/ipmgt/subnets/${id.value}/scan`, { method: 'POST' })
    scanDialog.report = report
    scanDialog.hosts = (report.discovered || []).map((d: any) => ({ ip: d.ip, hostname: d.hostname || '', description: '', rttMs: d.rttMs }))
    await Promise.all([refreshAll(), refreshScans()])
  } catch (e: any) {
    scanDialog.open = false
    toast.add({ title: 'Scan failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { scanning.value = false }
}
function removeDiscovered(ip: string) { scanDialog.hosts = scanDialog.hosts.filter((h) => h.ip !== ip) }
async function addDiscoveredHosts() {
  if (!scanDialog.hosts.length) return
  addingHosts.value = true
  try {
    const res = await $fetch<any>(`/api/ipmgt/subnets/${id.value}/add-discovered`, { method: 'POST', body: { hosts: scanDialog.hosts } })
    const skippedNote = res.skipped?.length ? `, ${res.skipped.length} skipped` : ''
    toast.add({ title: `Added ${res.added} discovered host(s)${skippedNote}`, color: 'primary', icon: 'i-lucide-check' })
    scanDialog.open = false
    await refreshAll()
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { addingHosts.value = false }
}

// ── Release address ─────────────────────────────────────────────────────────
const releaseTarget = ref<any>(null)
const releasing = ref(false)
async function confirmRelease() {
  if (!releaseTarget.value) return
  releasing.value = true
  try {
    await $fetch(`/api/ipmgt/addresses/${releaseTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Address released', color: 'primary', icon: 'i-lucide-check' })
    releaseTarget.value = null
    await refreshAll()
  } catch (e: any) { toast.add({ title: 'Release failed', description: e?.data?.statusMessage, color: 'error' }) }
  finally { releasing.value = false }
}

// ── Edit / delete subnet ────────────────────────────────────────────────────
const subnetFormOpen = ref(false)
const deleteOpen = ref(false)
async function deleteSubnet(headers: Record<string, string>) {
  const force = !!subnet.value?.usage?.used
  await $fetch(`/api/ipmgt/subnets/${id.value}${force ? '?force=true' : ''}`, { method: 'DELETE', headers })
  toast.add({ title: 'Subnet deleted', color: 'primary', icon: 'i-lucide-check' })
  await navigateTo('/ipmgt/subnets')
}

/** Short per-cell label for the address map: last octet for v4 ('.191'), last hextet for v6. */
function cellLabel(ip: string): string {
  if (ip.includes(':')) { const g = ip.split(':').pop(); return g ? `:${g}` : '::' }
  return `.${ip.split('.').pop()}`
}

const facts = computed(() => {
  const s = subnet.value
  if (!s) return []
  return [
    ['Network', s.info?.network], ['CIDR', s.network], ['Netmask', s.info?.netmask],
    ['Wildcard', s.info?.wildcard || '—'], ['Broadcast', s.info?.broadcast],
    ['First usable', s.info?.firstUsable], ['Last usable', s.info?.lastUsable],
    ['Gateway', s.gateway || '—'], ['Total', s.info?.total], ['Usable', s.info?.usable],
    ['Section', s.section_name || '—'], ['VLAN', s.vlan_number ? `${s.vlan_number} · ${s.vlan_name}` : '—'],
    ['VRF', s.vrf_name || '—'], ['Location', s.location || '—'], ['DNS servers', s.dns_servers || '—'], ['Owner', s.owner || '—']
  ]
})
</script>

<template>
  <div>
    <PageHeader :title="subnet?.network || 'Subnet'" :subtitle="subnet?.name || 'Subnet detail'" icon="i-lucide-network">
      <template v-if="hasApp('ipmgt') && subnet" #actions>
        <div class="flex flex-wrap items-center gap-2">
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-search-check" @click="findFirstFree">Find free</UButton>
          <UButton v-if="canAssign" size="sm" color="neutral" variant="soft" icon="i-lucide-bookmark" @click="reserveFirstFree">Reserve free</UButton>
          <UButton v-if="canScan && (subnet.ping_enabled || subnet.scan_enabled)" size="sm" color="neutral" variant="soft" icon="i-lucide-radar" :loading="scanning" @click="runScan">Run scan</UButton>
          <UButton v-if="canCreate" size="sm" icon="i-lucide-plus" @click="addAddress()">Add address</UButton>
          <UButton v-if="canUpdate" size="sm" variant="ghost" icon="i-lucide-pencil" aria-label="Edit subnet" @click="subnetFormOpen = true" />
          <UButton v-if="canDelete" size="sm" variant="ghost" color="error" icon="i-lucide-trash-2" aria-label="Delete subnet" @click="deleteOpen = true" />
        </div>
      </template>
    </PageHeader>

    <div v-if="!hasApp('ipmgt')" class="panel flex flex-col items-center gap-2 p-10 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-faint" />
      <p class="text-sm text-(--color-muted)">You don't have access to KNetraHub-IPMgt.</p>
    </div>

    <DataState v-else :status="status" :error="error">
      <div v-if="subnet" class="space-y-6">
        <NuxtLink to="/ipmgt/subnets" class="inline-flex items-center gap-1 text-xs text-faint hover:text-beacon"><UIcon name="i-lucide-arrow-left" class="size-3.5" /> Back to subnets</NuxtLink>

        <!-- Facts + usage -->
        <div class="grid gap-4 xl:grid-cols-3">
          <section class="panel p-5 xl:col-span-2">
            <h2 class="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Details</h2>
            <dl class="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              <div v-for="[k, v] in facts" :key="k">
                <dt class="text-xs text-faint">{{ k }}</dt>
                <dd class="truncate font-mono text-sm text-foam" :title="String(v)">{{ v }}</dd>
              </div>
            </dl>
            <p v-if="subnet.description" class="mt-4 border-t border-surface pt-3 text-sm text-(--color-muted)">{{ subnet.description }}</p>
          </section>

          <section class="panel p-5 flex flex-col justify-center">
            <h2 class="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Utilization</h2>
            <p class="font-display text-4xl font-bold text-foam">{{ subnet.usage?.percent || 0 }}%</p>
            <p class="mt-1 text-xs text-(--color-muted)">{{ subnet.usage?.used || 0 }} used · {{ subnet.usage?.free || 0 }} free of {{ subnet.usage?.capacity || 0 }}</p>
            <div class="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div class="h-full rounded-full" :class="usageBarClass(subnet.usage?.percent || 0)" :style="{ width: `${subnet.usage?.percent || 0}%` }" />
            </div>
            <div v-if="subnet.children?.length" class="mt-4 border-t border-surface pt-3">
              <p class="mb-1 text-xs text-faint">Child subnets</p>
              <NuxtLink v-for="c in subnet.children" :key="c.id" :to="`/ipmgt/subnets/${c.id}`" class="block font-mono text-xs text-beacon hover:underline">{{ c.network }}</NuxtLink>
            </div>
          </section>
        </div>

        <section v-if="subnet.ping_enabled || subnet.scan_enabled || scanHistory.length" class="panel p-5">
          <h2 class="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Recent scans</h2>
          <p v-if="!scanHistory.length" class="text-sm text-faint">No scans run yet.</p>
          <table v-else class="w-full text-left text-sm">
            <thead class="text-xs uppercase text-faint">
              <tr>
                <th class="px-2 py-2 font-medium">Started</th>
                <th class="px-2 py-2 font-medium">Trigger</th>
                <th class="px-2 py-2 font-medium">Scanned</th>
                <th class="px-2 py-2 font-medium">Up</th>
                <th class="px-2 py-2 font-medium">New</th>
                <th class="px-2 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-for="h in scanHistory" :key="h.id">
                <td class="px-2 py-2 text-xs text-faint">{{ (h.started_at || '').slice(0, 16).replace('T', ' ') }}</td>
                <td class="px-2 py-2 text-(--color-muted) capitalize">{{ h.trigger }}</td>
                <td class="px-2 py-2 text-(--color-muted)">{{ h.hosts_scanned }}</td>
                <td class="px-2 py-2 text-(--color-muted)">{{ h.hosts_up }}</td>
                <td class="px-2 py-2 text-(--color-muted)">{{ h.new_hosts }}</td>
                <td class="px-2 py-2"><span :class="h.error ? 'text-rose-400' : 'text-emerald-400'">{{ h.error ? 'Failed' : (h.finished_at ? 'OK' : 'Running…') }}</span></td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- Visual grid -->
        <section class="panel p-5">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Address map</h2>
            <div class="flex items-center gap-3">
              <div class="flex flex-wrap items-center gap-2 text-xs text-faint">
                <span v-for="k in ['free','used','reserved','dhcp','offline','deprecated','gateway']" :key="k" class="inline-flex items-center gap-1">
                  <span class="size-2.5 rounded-sm" :class="statusMeta(k).swatch" /> {{ statusMeta(k).label }}
                </span>
              </div>
              <UInput v-model="gridFilter" icon="i-lucide-search" size="xs" placeholder="Filter IP…" class="w-40" />
            </div>
          </div>
          <p v-if="grid?.truncated" class="mb-2 text-xs text-amber-400">Showing first {{ grid.gridLimit }} of {{ grid.total }} addresses.</p>
          <div class="flex flex-wrap gap-1">
            <button v-for="c in visibleCells" :key="c.ip"
                    class="group relative flex h-6 min-w-10 items-center justify-center rounded-sm px-1 font-mono text-[10px] leading-none transition hover:ring-2 hover:ring-beacon"
                    :class="statusMeta(c.status).swatch"
                    :title="`${c.ip}${c.record?.hostname ? ' · ' + c.record.hostname : ''} (${statusMeta(c.status).label})`"
                    @click="onCellClick(c)">{{ cellLabel(c.ip) }}</button>
          </div>
        </section>

        <!-- Defined addresses table -->
        <section class="panel overflow-x-auto">
          <div class="flex items-center justify-between px-4 py-3">
            <h2 class="font-display text-sm font-semibold uppercase tracking-wider text-(--color-muted)">Defined addresses ({{ definedAddresses.length }})</h2>
          </div>
          <table class="w-full text-left text-sm">
            <thead class="bg-surface-2 text-xs uppercase text-faint">
              <tr>
                <th class="px-4 py-3 font-medium">Address</th>
                <th class="px-4 py-3 font-medium">Hostname</th>
                <th class="px-4 py-3 font-medium">Status</th>
                <th class="px-4 py-3 font-medium">Owner</th>
                <th class="px-4 py-3 font-medium">MAC</th>
                <th class="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface">
              <tr v-if="!definedAddresses.length"><td colspan="6" class="px-4 py-8 text-center text-sm text-faint">No addresses defined. Click a free cell above or “Add address”.</td></tr>
              <tr v-for="c in definedAddresses" :key="c.ip" class="hover:bg-surface-2/40">
                <td class="px-4 py-3 font-mono text-foam">{{ c.ip }}</td>
                <td class="px-4 py-3 text-(--color-muted)">{{ c.record.hostname || '—' }}</td>
                <td class="px-4 py-3"><IpamIpStatusBadge :status="c.status" /></td>
                <td class="px-4 py-3 text-(--color-muted)">{{ c.record.owner || '—' }}</td>
                <td class="px-4 py-3 font-mono text-xs text-faint">{{ c.record.mac || '—' }}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <UButton v-if="canUpdate" size="xs" variant="ghost" icon="i-lucide-pencil" aria-label="Edit" @click="editAddress(c.record.id)" />
                    <UButton v-if="canUpdate" size="xs" variant="ghost" color="error" icon="i-lucide-x" aria-label="Release" @click="releaseTarget = c.record" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </DataState>

    <IpamAddressFormModal v-model:open="addrOpen" :address="editingAddr" :subnet-id="id" :preset-ip="presetIp" @saved="refreshAll" />
    <IpamSubnetFormModal v-model:open="subnetFormOpen" :subnet="subnet" @saved="refreshAll" />

    <!-- Scan results: review discovered hosts before saving -->
    <UModal v-model:open="scanDialog.open" title="Scan subnet" :ui="{ content: 'max-w-2xl' }" :dismissible="!scanning">
      <template #body>
        <div class="space-y-4">
          <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt class="text-faint">Subnet</dt>
            <dd class="font-mono text-foam">{{ subnet?.network }}<span v-if="subnet?.name" class="ml-1 font-sans text-(--color-muted)">({{ subnet.name }})</span></dd>
            <dt class="text-faint">Scan type</dt>
            <dd class="text-(--color-muted)">Discovery scan: ping</dd>
          </dl>

          <div v-if="scanning" class="flex items-center gap-2 py-6 text-sm text-(--color-muted)">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Scanning {{ subnet?.network }}…
          </div>

          <template v-else-if="scanDialog.report">
            <p class="text-xs text-faint">{{ scanDialog.report.hostsScanned }} scanned · {{ scanDialog.report.hostsUp }} up · {{ scanDialog.report.newHosts }} new</p>

            <div v-if="scanDialog.hosts.length">
              <p class="mb-2 text-sm font-medium text-foam">Scan results:</p>
              <table class="w-full text-left text-sm">
                <thead class="bg-surface-2 text-xs uppercase text-faint">
                  <tr>
                    <th class="px-3 py-2 font-medium">IP</th>
                    <th class="px-3 py-2 font-medium">Description</th>
                    <th class="px-3 py-2 font-medium">Hostname</th>
                    <th class="px-3 py-2" />
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface">
                  <tr v-for="h in scanDialog.hosts" :key="h.ip">
                    <td class="px-3 py-2 font-mono text-foam">{{ h.ip }}</td>
                    <td class="px-3 py-2"><UInput v-model="h.description" size="xs" placeholder="Description" class="w-full" /></td>
                    <td class="px-3 py-2"><UInput v-model="h.hostname" size="xs" placeholder="Hostname" class="w-full" /></td>
                    <td class="px-3 py-2 text-right">
                      <UButton size="xs" variant="ghost" color="error" icon="i-lucide-x" aria-label="Discard host" @click="removeDiscovered(h.ip)" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="py-2 text-sm text-faint">No new hosts discovered. Existing addresses had their status refreshed.</p>
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between gap-3">
          <span class="text-xs text-faint">Scan method: ping</span>
          <div class="flex gap-3">
            <UButton variant="ghost" :disabled="scanning" @click="scanDialog.open = false">{{ scanDialog.hosts.length ? 'Cancel' : 'Close' }}</UButton>
            <UButton v-if="canCreate && scanDialog.hosts.length" color="primary" icon="i-lucide-plus" :loading="addingHosts" @click="addDiscoveredHosts">
              Add {{ scanDialog.hosts.length }} discovered host(s)
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal :open="!!releaseTarget" @update:open="(v: boolean) => { if (!v) releaseTarget = null }" title="Release address">
      <template #body>
        <p class="text-sm text-(--color-muted)">Release <span class="font-mono text-foam">{{ releaseTarget?.ip }}</span>? It becomes free again.</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton variant="ghost" @click="releaseTarget = null">Cancel</UButton>
          <UButton color="error" :loading="releasing" @click="confirmRelease">Release</UButton>
        </div>
      </template>
    </UModal>

    <ConfirmDeleteModal
      type="ipmgt.subnet"
      :item-name="subnet?.network"
      v-model:open="deleteOpen"
      title="Delete subnet"
      :message="subnet ? `Subnet ${subnet.network} and all ${subnet.usage?.used || 0} defined address(es) will be permanently removed.` : ''"
      confirm-label="Delete subnet"
      :action="deleteSubnet"
    />
  </div>
</template>
