<script setup lang="ts">
// Discovery: CIDR scan (operator) — pings a subnet in the background and
// records candidates. Nothing is added to Devices until the operator reviews
// the results here and explicitly imports selected hosts.
const { hasMonitoring, canOperate } = useMonitoring()
const toast = useToast()
const form = reactive({ cidr: '', poller_group: 0 })
const scanning = ref(false)
const activeScanId = ref<number | null>(null)
const activeScan = ref<any>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}
async function loadScan(id: number) {
  activeScan.value = await $fetch<any>(`/api/monitoring/v1/discovery/scans/${id}`)
  await refreshCandidates()
  if (activeScan.value?.status !== 'running') stopPolling()
}
function watchScan(id: number) {
  stopPolling()
  pollTimer = setInterval(() => loadScan(id), 2000)
}
onBeforeUnmount(stopPolling)

async function startScan() {
  scanning.value = true
  try {
    const res = await $fetch<any>('/api/monitoring/v1/discovery/scan', { method: 'POST', body: { ...form } })
    toast.add({ title: 'Scan started', description: `${res.total_hosts} host(s) queued for a reachability sweep`, color: 'primary', icon: 'i-lucide-check' })
    activeScanId.value = res.scan_id
    candidatePage.value = 1
    await loadScan(res.scan_id)
    if (activeScan.value?.status === 'running') watchScan(res.scan_id)
    await refreshScans()
  } catch (e: any) {
    toast.add({ title: 'Scan failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { scanning.value = false }
}

async function openScan(id: number) {
  activeScanId.value = id
  candidatePage.value = 1
  selectedCandidates.value = new Set()
  await loadScan(id)
  if (activeScan.value?.status === 'running') watchScan(id)
}

// Candidates for the active scan
const candidatePage = ref(1)
const showAll = ref(false) // false = alive + not-already-a-device only
const candidatesUrl = computed(() => {
  if (!activeScanId.value) return null
  const p = new URLSearchParams({ page: String(candidatePage.value), per_page: '50' })
  if (!showAll.value) { p.set('alive', '1'); p.set('already_exists', '0') }
  return `/api/monitoring/v1/discovery/scans/${activeScanId.value}/candidates?${p}`
})
const { data: candidatesData, refresh: refreshCandidates } = useAsyncData('monDiscCandidates',
  () => candidatesUrl.value ? $fetch<any>(candidatesUrl.value) : Promise.resolve({ items: [], total: 0 }),
  { server: false, default: () => ({ items: [], total: 0 }), watch: [candidatesUrl] })
const candidateTotalPages = computed(() => Math.max(1, Math.ceil((candidatesData.value?.total ?? 0) / 50)))

watch(showAll, () => { candidatePage.value = 1 })

const selectedCandidates = ref<Set<number>>(new Set())
// Default-select alive/importable candidates the first time each row is seen
// only — otherwise a manual uncheck gets silently reverted on the next
// poll-driven refresh of the same page (candidate ids are globally unique,
// so tracking "seen" across scans/pages is safe with no false positives).
const autoSelected = new Set<number>()
watch(candidatesData, (d) => {
  const next = new Set(selectedCandidates.value)
  for (const c of d?.items ?? []) {
    if (autoSelected.has(c.id)) continue
    autoSelected.add(c.id)
    if (c.alive && !c.already_exists && !c.imported) next.add(c.id)
  }
  selectedCandidates.value = next
})
function toggleCandidate(id: number) {
  const next = new Set(selectedCandidates.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  selectedCandidates.value = next
}

const importing = ref(false)
async function importSelected() {
  if (!activeScanId.value || !selectedCandidates.value.size) return
  importing.value = true
  try {
    const res = await $fetch<any>(`/api/monitoring/v1/discovery/scans/${activeScanId.value}/import`, {
      method: 'POST', body: { candidate_ids: [...selectedCandidates.value] }
    })
    toast.add({
      title: `Imported ${res.imported} device(s)`,
      description: res.skipped_existing ? `${res.skipped_existing} already existed and were skipped` : 'Discovery queued for each.',
      color: 'primary', icon: 'i-lucide-check'
    })
    selectedCandidates.value = new Set()
    await refreshCandidates()
  } catch (e: any) {
    toast.add({ title: 'Import failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { importing.value = false }
}

// Recent scans, so an operator can come back and review/import later.
const { data: recentScans, refresh: refreshScans } = useAsyncData('monDiscScans',
  () => $fetch<any>('/api/monitoring/v1/discovery/scans'),
  { server: false, default: () => ({ items: [] }) })

function scanStatusColor(s: string): string {
  return s === 'running' ? 'text-sky-400' : s === 'failed' ? 'text-rose-400' : 'text-emerald-400'
}
</script>

<template>
  <div>
    <PageHeader title="Discovery" subtitle="CIDR sweeps — review before anything is added" icon="i-lucide-scan-line" />
    <div v-if="!hasMonitoring" class="panel p-10 text-center text-muted">No access.</div>
    <div v-else class="space-y-6">
      <div class="panel max-w-xl p-4">
        <h2 class="mb-3 font-semibold">Scan a network</h2>
        <p class="mb-3 text-sm text-muted">
          Pings every host in the CIDR in the background. Nothing is added to Devices — review the
          reachable hosts below and choose which ones to import. Max /20 per scan. Imported devices get SNMP data
          automatically if any <NuxtLink to="/monitoring/settings/credentials" class="text-primary hover:underline">saved credential profile</NuxtLink>
          matches them — no per-scan SNMP fields needed.
        </p>
        <div class="flex gap-2">
          <UInput v-model="form.cidr" placeholder="192.168.1.0/24" class="flex-1" :disabled="!canOperate" />
          <UButton :loading="scanning" :disabled="!canOperate || !form.cidr" @click="startScan">Scan</UButton>
        </div>
        <p v-if="!canOperate" class="mt-2 text-xs text-amber-400">Requires the Monitoring operator tier.</p>
      </div>

      <div v-if="activeScan" class="panel p-4">
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <h2 class="font-semibold">Scan #{{ activeScan.id }} — {{ activeScan.cidr }}</h2>
          <span :class="['text-xs font-medium uppercase', scanStatusColor(activeScan.status)]">{{ activeScan.status }}</span>
          <span class="text-sm text-muted">
            {{ activeScan.scanned_hosts }}/{{ activeScan.total_hosts }} scanned · {{ activeScan.alive_hosts }} alive
          </span>
          <UButton size="xs" variant="ghost" class="ml-auto" icon="i-lucide-refresh-cw" @click="loadScan(activeScan.id)">Refresh</UButton>
        </div>
        <p v-if="activeScan.status === 'failed'" class="mb-3 text-sm text-rose-400">{{ activeScan.error }}</p>

        <div class="mb-3 flex flex-wrap items-center gap-2">
          <UCheckbox v-model="showAll" label="Show all scanned hosts (including dead / already-added)" />
          <UButton size="xs" :disabled="!canOperate || !selectedCandidates.size || importing" :loading="importing"
            class="ml-auto" @click="importSelected">Import selected ({{ selectedCandidates.size }})</UButton>
        </div>

        <div class="panel overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-surface-2 text-left text-xs uppercase text-faint">
              <tr><th class="w-8 px-3 py-2" /><th class="px-3 py-2">IP</th><th class="px-3 py-2">Reachable</th>
                <th class="px-3 py-2">RTT</th><th class="px-3 py-2">Status</th></tr>
            </thead>
            <tbody>
              <tr v-if="!candidatesData?.items?.length"><td colspan="5" class="px-3 py-8 text-center text-muted">
                {{ activeScan.status === 'running' ? 'Scanning…' : 'No candidates match this filter.' }}
              </td></tr>
              <tr v-for="c in candidatesData.items" :key="c.id" class="border-t border-hull">
                <td class="px-3 py-2">
                  <UCheckbox :model-value="selectedCandidates.has(c.id)" :disabled="c.already_exists || c.imported"
                    @update:model-value="toggleCandidate(c.id)" />
                </td>
                <td class="px-3 py-2 font-mono text-xs">{{ c.ip }}</td>
                <td class="px-3 py-2">
                  <span :class="c.alive ? 'text-emerald-400' : 'text-faint'">{{ c.alive ? 'Alive' : 'No reply' }}</span>
                </td>
                <td class="px-3 py-2 text-xs text-faint">{{ c.rtt_ms != null ? `${Math.round(c.rtt_ms)}ms` : '—' }}</td>
                <td class="px-3 py-2 text-xs">
                  <NuxtLink v-if="c.imported && c.imported_device_id" :to="`/monitoring/devices/${c.imported_device_id}`" class="text-primary hover:underline">Imported</NuxtLink>
                  <NuxtLink v-else-if="c.already_exists && c.existing_device_id" :to="`/monitoring/devices/${c.existing_device_id}`" class="text-faint hover:underline">Already a device</NuxtLink>
                  <span v-else class="text-faint">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="candidateTotalPages > 1" class="mt-3 flex items-center justify-center gap-2">
          <UButton size="xs" :disabled="candidatePage <= 1" @click="candidatePage--">Prev</UButton>
          <span class="text-sm text-muted">{{ candidatePage }} / {{ candidateTotalPages }}</span>
          <UButton size="xs" :disabled="candidatePage >= candidateTotalPages" @click="candidatePage++">Next</UButton>
        </div>
      </div>

      <div class="panel p-4">
        <h2 class="mb-2 font-semibold">Recent scans</h2>
        <p v-if="!recentScans?.items?.length" class="text-sm text-muted">No scans yet.</p>
        <ul v-else class="space-y-1 text-sm">
          <li v-for="s in recentScans.items" :key="s.id" class="flex items-center justify-between border-t border-hull py-1.5 first:border-t-0">
            <button class="text-left text-primary hover:underline" @click="openScan(s.id)">{{ s.cidr }}</button>
            <span class="flex items-center gap-3 text-xs text-faint">
              <span :class="scanStatusColor(s.status)">{{ s.status }}</span>
              <span>{{ s.alive_hosts }}/{{ s.total_hosts }} alive</span>
              <span>{{ new Date(s.created_at).toLocaleString() }}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
