<script setup lang="ts">
import type { BrowserRepo } from '~~/layers/docker/app/utils/registryBrowser'

// Docker Registry browser (docker-registry-ui style). Three views driven by the
// route query so they're linkable + back/forward friendly:
//   ?reg=<id>                      → repositories list (grouped by prefix)
//   ?reg=<id>&repo=<name>          → tags table for a repository
//   ?reg=<id>&repo=<name>&tag=<t>  → layer history for a tag
const route = useRoute()
const router = useRouter()
const { bytes, relative } = useFormat()
const toast = useToast()

// Client-only: these endpoints require a session cookie, which isn't forwarded
// on internal SSR $fetch. The whole browser is interactive anyway.
const { data: registries } = useAsyncData('registryBrowserRegistries', () => $fetch<any[]>('/api/registries'), {
  default: () => [] as any[],
  server: false
})

const regParam = computed(() => (route.query.reg as string) || '')
const repoParam = computed(() => (route.query.repo as string) || '')
const tagParam = computed(() => (route.query.tag as string) || '')
const view = computed<'repos' | 'tags' | 'history'>(() => (tagParam.value ? 'history' : repoParam.value ? 'tags' : 'repos'))

const activeRegistry = computed(() => (registries.value || []).find((r) => r.id === regParam.value) || null)
const activeBase = computed(() => {
  const u = activeRegistry.value?.url
  if (!u) return ''
  try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).origin } catch { return u }
})

// Registry filter (repos view). Setting it resets to the repos list.
const selectedRegistry = computed({
  get: () => regParam.value,
  set: (v: string) => router.replace({ query: v ? { reg: v } : {} })
})
const registryItems = computed(() => [
  { value: '', label: 'All registries' },
  ...(registries.value || []).map((r) => ({ value: r.id, label: r.name }))
])

function openTags(repo: BrowserRepo) {
  router.push({ query: { reg: repo.registryId, repo: repo.name } })
}
function openHistory(tag: string) {
  router.push({ query: { reg: regParam.value, repo: repoParam.value, tag } })
}
function back() {
  if (view.value === 'history') router.push({ query: { reg: regParam.value, repo: repoParam.value } })
  else router.push({ query: regParam.value ? { reg: regParam.value } : {} })
}

// ─── Repositories ───────────────────────────────────────────────────────────
const repos = ref<BrowserRepo[]>([])
const loadingRepos = ref(false)
const regErrors = ref<{ name: string; message: string }[]>([])
const search = ref('')
const groupExpanded = ref<Set<string>>(new Set())

async function loadRepos() {
  if (import.meta.server) return
  const list = registries.value || []
  if (!list.length) { repos.value = []; return }
  const targets = regParam.value ? list.filter((r) => r.id === regParam.value) : list
  loadingRepos.value = true
  regErrors.value = []
  try {
    const results = await Promise.all(
      targets.map(async (r) => {
        try {
          const res = await $fetch<any>(`/api/registries/${r.id}/repositories`)
          return (res.repositories || []).map((name: string) => ({ name, registryId: r.id, registryName: r.name }))
        } catch (e: any) {
          regErrors.value.push({ name: r.name, message: e?.data?.statusMessage || 'Failed to load' })
          return [] as BrowserRepo[]
        }
      })
    )
    repos.value = results.flat()
  } finally {
    loadingRepos.value = false
  }
}
watch([registries, regParam, view], () => { if (view.value === 'repos') loadRepos() }, { immediate: true })

const filteredRepos = computed(() => {
  const s = search.value.toLowerCase().trim()
  if (!s) return repos.value
  return repos.value.filter((r) => r.name.toLowerCase().includes(s) || r.registryName.toLowerCase().includes(s))
})
const groupedRows = computed(() => groupRepositories(filteredRepos.value))
const totalImages = computed(() => repos.value.length)
const totalRepositories = computed(() => new Set(repos.value.map((r) => `${r.registryId} ${r.name.split('/')[0]}`)).size)
const showRegistryBadge = computed(() => !regParam.value && (registries.value || []).length > 1)

function toggleGroup(key: string) {
  const n = new Set(groupExpanded.value)
  n.has(key) ? n.delete(key) : n.add(key)
  groupExpanded.value = n
}

// ─── Tags ─────────────────────────────────────────────────────────────────
interface TagRow { tag: string; created: string | null; size: number | null; arch: string | null; loaded: boolean; error: boolean }
const tagRows = ref<TagRow[]>([])
const loadingTags = ref(false)
const tagsError = ref<string | null>(null)
let hydrateToken = 0

async function loadTags() {
  if (import.meta.server || view.value !== 'tags') return
  loadingTags.value = true
  tagsError.value = null
  tagRows.value = []
  try {
    const res = await $fetch<any>(`/api/registries/${regParam.value}/tags`, { query: { repo: repoParam.value } })
    tagRows.value = (res.tags || []).map((tag: string) => ({ tag, created: null, size: null, arch: null, loaded: false, error: false }))
    void hydrateTagDetails()
  } catch (e: any) {
    tagsError.value = e?.data?.statusMessage || 'Failed to load tags'
  } finally {
    loadingTags.value = false
  }
}

// Fill in per-tag created/size/arch progressively, bounded concurrency.
async function hydrateTagDetails() {
  const token = ++hydrateToken
  const rows = tagRows.value
  let i = 0
  const worker = async () => {
    while (i < rows.length) {
      const row = rows[i++]
      if (!row) continue
      try {
        const d = await $fetch<any>(`/api/registries/${regParam.value}/manifest`, { query: { repo: repoParam.value, tag: row.tag } })
        if (token !== hydrateToken) return
        const arch = d.architecture || (d.platforms || []).map((p: any) => p.architecture).filter(Boolean).join(', ') || null
        Object.assign(row, { created: d.created, size: d.totalSize, arch, loaded: true })
      } catch {
        if (token !== hydrateToken) return
        Object.assign(row, { loaded: true, error: true })
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
}
watch([view, regParam, repoParam], loadTags, { immediate: true })

const sortKey = ref<'created' | 'size' | 'tag'>('created')
const sortDir = ref<'asc' | 'desc'>('desc')
function toggleSort(k: 'created' | 'size' | 'tag') {
  if (sortKey.value === k) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = k; sortDir.value = k === 'tag' ? 'asc' : 'desc' }
}
const sortedTagRows = computed(() => {
  const dir = sortDir.value === 'asc' ? 1 : -1
  const rows = [...tagRows.value]
  rows.sort((a, b) => {
    if (sortKey.value === 'tag') return a.tag.localeCompare(b.tag) * dir
    if (sortKey.value === 'size') return ((a.size ?? -1) - (b.size ?? -1)) * dir
    const at = a.created ? Date.parse(a.created) : -Infinity
    const bt = b.created ? Date.parse(b.created) : -Infinity
    return (at - bt) * dir
  })
  return rows
})

// ─── History ────────────────────────────────────────────────────────────────
const history = ref<any>(null)
const loadingHistory = ref(false)
const historyError = ref<string | null>(null)
const dockerfileOpen = ref(false)

async function loadHistory() {
  if (import.meta.server || view.value !== 'history') return
  loadingHistory.value = true
  historyError.value = null
  history.value = null
  try {
    history.value = await $fetch<any>(`/api/registries/${regParam.value}/history`, { query: { repo: repoParam.value, tag: tagParam.value } })
  } catch (e: any) {
    historyError.value = e?.data?.statusMessage || 'Failed to load history'
  } finally {
    loadingHistory.value = false
  }
}
watch([view, regParam, repoParam, tagParam], loadHistory, { immediate: true })

// Layer history is oldest-first; show newest-first like docker-registry-ui.
const displayHistory = computed(() => (history.value?.history ? [...history.value.history].reverse() : []))
const dockerfile = computed(() => (history.value?.history ? buildDockerfile(history.value.history) : ''))
const cfgList = (arr?: string[] | null) => (Array.isArray(arr) ? arr.join(' ') : '')

function fmtFull(iso?: string | null) {
  if (!iso) return '—'
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '—' : new Date(t).toLocaleString()
}
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Copied', color: 'success', icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: 'Copy failed', color: 'error' })
  }
}

// ─── PageHeader ───────────────────────────────────────────────────────────
const pageTitle = computed(() =>
  view.value === 'history' ? `History of ${repoParam.value}:${tagParam.value}`
    : view.value === 'tags' ? `Tags of ${repoParam.value}`
    : 'Registry'
)
const pageSubtitle = computed(() => {
  if (view.value === 'history') return activeBase.value ? `${activeBase.value}/${repoParam.value}` : repoParam.value
  if (view.value === 'tags') return `Sourced from ${activeBase.value}/${repoParam.value} · ${tagRows.value.length} tags`
  return regParam.value ? (activeRegistry.value?.name || 'Registry') : 'Browse repositories and image tags in your private registries'
})
const pageIcon = computed(() =>
  view.value === 'history' ? 'i-lucide-history' : view.value === 'tags' ? 'i-lucide-tags' : 'i-lucide-package-search'
)
</script>

<template>
  <div>
    <PageHeader :title="pageTitle" :subtitle="pageSubtitle" :icon="pageIcon">
      <template #actions>
        <!-- Repos toolbar: registry filter + search -->
        <div v-if="view === 'repos'" class="flex flex-wrap items-center gap-2">
          <USelect
            v-model="selectedRegistry"
            :items="registryItems"
            value-key="value"
            label-key="label"
            icon="i-lucide-filter"
            size="sm"
            class="w-48"
            :disabled="!(registries || []).length"
          />
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search repositories..." size="sm" class="w-56" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" size="sm" :loading="loadingRepos" @click="loadRepos" />
        </div>
        <!-- Tags / history toolbar: back (+ dockerfile) -->
        <div v-else class="flex items-center gap-2">
          <UButton v-if="view === 'history' && dockerfile" icon="i-lucide-file-code" color="neutral" variant="soft" size="sm" label="Dockerfile" @click="dockerfileOpen = true" />
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="soft" size="sm" label="Back" @click="back" />
        </div>
      </template>
    </PageHeader>

    <!-- ─── Repositories view ─────────────────────────────────────────── -->
    <template v-if="view === 'repos'">
      <div v-if="!(registries || []).length" class="panel flex flex-col items-center gap-2 p-10 text-center">
        <UIcon name="i-lucide-container" class="size-7 text-beacon" />
        <h2 class="font-display text-lg font-semibold text-foam">No registries configured</h2>
        <p class="max-w-md text-sm text-(--color-muted)">Add a private registry's URL and credentials first, then browse its images here.</p>
        <UButton class="mt-2" icon="i-lucide-plus" size="sm" to="/docker/settings">Add a registry</UButton>
      </div>

      <div v-else class="space-y-4">
        <div class="panel flex items-center gap-3 px-5 py-3">
          <UIcon name="i-lucide-package-search" class="size-5 text-beacon" />
          <p class="text-sm text-(--color-muted)">
            <span class="font-semibold text-foam">{{ totalImages }}</span> images in
            <span class="font-semibold text-foam">{{ totalRepositories }}</span> repositories
          </p>
        </div>

        <div v-for="err in regErrors" :key="err.name" class="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-(--color-muted)">
          <UIcon name="i-lucide-triangle-alert" class="size-4 text-rose-500 shrink-0" />
          <span><span class="font-medium text-foam">{{ err.name }}</span>: {{ err.message }}</span>
        </div>

        <div v-if="loadingRepos && !repos.length" class="panel p-10 text-center text-faint">Loading repositories...</div>
        <div v-else-if="!groupedRows.length" class="panel p-10 text-center text-faint">
          {{ search ? 'No repositories match your search.' : 'No repositories found.' }}
        </div>

        <div v-else class="panel divide-y divide-surface">
          <template v-for="row in groupedRows" :key="row.key">
            <!-- Group (shared prefix) -->
            <template v-if="row.type === 'group'">
              <button class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2/50" @click="toggleGroup(row.key)">
                <UIcon name="i-lucide-chevron-right" class="size-4 text-faint transition-transform" :class="groupExpanded.has(row.key) ? 'rotate-90' : ''" />
                <UIcon :name="groupExpanded.has(row.key) ? 'i-lucide-folder-open' : 'i-lucide-folder'" class="size-4 text-beacon shrink-0" />
                <span class="font-mono text-sm text-foam">{{ row.prefix }}/</span>
                <UBadge v-if="showRegistryBadge" size="xs" variant="subtle" color="neutral" class="shrink-0">{{ row.registryName }}</UBadge>
                <UBadge size="xs" variant="soft" color="neutral" class="ml-auto shrink-0">{{ row.count }} images</UBadge>
              </button>
              <template v-if="groupExpanded.has(row.key)">
                <button
                  v-for="child in row.children"
                  :key="child.key"
                  class="flex w-full items-center gap-3 bg-surface-2/20 py-2.5 pl-12 pr-4 text-left transition hover:bg-surface-2/50"
                  @click="openTags(child.repo)"
                >
                  <UIcon name="i-lucide-box" class="size-4 text-beacon shrink-0" />
                  <span class="font-mono text-sm text-foam">{{ child.repo.name }}</span>
                  <UIcon name="i-lucide-chevron-right" class="ml-auto size-4 text-faint" />
                </button>
              </template>
            </template>

            <!-- Leaf (single image) -->
            <button v-else class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2/50" @click="openTags(row.repo)">
              <UIcon name="i-lucide-box" class="size-4 text-beacon shrink-0" />
              <span class="font-mono text-sm text-foam">{{ row.repo.name }}</span>
              <UBadge v-if="showRegistryBadge" size="xs" variant="subtle" color="neutral" class="shrink-0">{{ row.repo.registryName }}</UBadge>
              <UIcon name="i-lucide-chevron-right" class="ml-auto size-4 text-faint" />
            </button>
          </template>
        </div>
      </div>
    </template>

    <!-- ─── Tags view ─────────────────────────────────────────────────── -->
    <template v-else-if="view === 'tags'">
      <div v-if="tagsError" class="panel p-10 text-center text-rose-400">{{ tagsError }}</div>
      <div v-else-if="loadingTags && !tagRows.length" class="panel p-10 text-center text-faint">Loading tags...</div>
      <div v-else-if="!tagRows.length" class="panel p-10 text-center text-faint">No tags in this repository.</div>
      <div v-else class="panel overflow-x-auto">
        <table class="w-full text-left text-sm text-(--color-muted)">
          <thead class="bg-surface-2 text-xs uppercase text-faint border-b border-surface">
            <tr>
              <th class="px-4 py-3 font-medium cursor-pointer select-none" @click="toggleSort('created')">
                Creation date <UIcon v-if="sortKey === 'created'" :name="sortDir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="size-3" />
              </th>
              <th class="px-4 py-3 font-medium cursor-pointer select-none" @click="toggleSort('size')">
                Size <UIcon v-if="sortKey === 'size'" :name="sortDir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="size-3" />
              </th>
              <th class="px-4 py-3 font-medium cursor-pointer select-none" @click="toggleSort('tag')">
                Tag <UIcon v-if="sortKey === 'tag'" :name="sortDir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'" class="size-3" />
              </th>
              <th class="px-4 py-3 font-medium">Arch</th>
              <th class="px-4 py-3 font-medium text-right">History</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface">
            <tr v-for="row in sortedTagRows" :key="row.tag" class="hover:bg-surface-2/50 transition">
              <td class="px-4 py-3">
                <span v-if="row.loaded" :class="row.error ? 'text-rose-400' : ''">{{ row.error ? 'Unavailable' : relative(row.created) }}</span>
                <span v-else class="text-faint italic">loading…</span>
              </td>
              <td class="px-4 py-3">{{ row.loaded && !row.error && row.size != null ? bytes(row.size) : '—' }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-foam">{{ row.tag }}</span>
                  <UButton icon="i-lucide-copy" size="xs" color="neutral" variant="ghost" aria-label="Copy tag" @click="copyText(row.tag)" />
                </div>
              </td>
              <td class="px-4 py-3">
                <div v-if="row.arch" class="flex flex-wrap gap-1">
                  <UBadge v-for="a in row.arch.split(', ')" :key="a" size="xs" variant="subtle" color="neutral" class="font-mono">{{ a }}</UBadge>
                </div>
                <span v-else>—</span>
              </td>
              <td class="px-4 py-3 text-right">
                <UButton icon="i-lucide-history" size="xs" color="neutral" variant="ghost" aria-label="View layer history" @click="openHistory(row.tag)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ─── History view ──────────────────────────────────────────────── -->
    <template v-else>
      <div v-if="historyError" class="panel p-10 text-center text-rose-400">{{ historyError }}</div>
      <div v-else-if="loadingHistory" class="panel p-10 text-center text-faint">Reading image config...</div>
      <div v-else-if="history" class="space-y-4">
        <!-- Config card -->
        <div class="panel p-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div><div class="text-xs uppercase text-faint">Created</div><div class="text-foam">{{ fmtFull(history.created) }}</div></div>
          <div><div class="text-xs uppercase text-faint">OS</div><div class="text-foam">{{ history.os || '—' }}</div></div>
          <div><div class="text-xs uppercase text-faint">Architecture</div><div class="text-foam">{{ history.architecture || '—' }}</div></div>
          <div class="min-w-0"><div class="text-xs uppercase text-faint">Digest</div><div class="font-mono text-xs text-foam truncate" :title="history.digest">{{ history.digest || '—' }}</div></div>
          <div><div class="text-xs uppercase text-faint">User</div><div class="text-foam">{{ history.config?.user || '—' }}</div></div>
          <div><div class="text-xs uppercase text-faint">Working Dir</div><div class="font-mono text-foam truncate">{{ history.config?.workingDir || '—' }}</div></div>
          <div class="min-w-0"><div class="text-xs uppercase text-faint">Cmd</div><div class="font-mono text-xs text-foam truncate" :title="cfgList(history.config?.cmd)">{{ cfgList(history.config?.cmd) || '—' }}</div></div>
          <div class="min-w-0"><div class="text-xs uppercase text-faint">Entrypoint</div><div class="font-mono text-xs text-foam truncate" :title="cfgList(history.config?.entrypoint)">{{ cfgList(history.config?.entrypoint) || '—' }}</div></div>
          <div class="min-w-0 sm:col-span-2 lg:col-span-3"><div class="text-xs uppercase text-faint">Env</div><div class="font-mono text-xs text-foam overflow-x-auto whitespace-nowrap">{{ cfgList(history.config?.env) || '—' }}</div></div>
        </div>

        <!-- Layer history -->
        <div class="panel divide-y divide-surface">
          <div v-for="(h, i) in displayHistory" :key="i" class="px-4 py-3">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><div class="text-xs uppercase text-faint">Created</div><div class="text-foam text-sm">{{ fmtFull(h.created) }}</div></div>
              <div>
                <div class="text-xs uppercase text-faint">Created By</div>
                <UBadge size="xs" variant="subtle" color="neutral" :title="cleanCreatedBy(h.createdBy)">{{ instructionOf(h.createdBy) }}</UBadge>
              </div>
              <div><div class="text-xs uppercase text-faint">Size</div><div class="text-foam text-sm">{{ h.size != null ? bytes(h.size) : '—' }}</div></div>
              <div v-if="h.comment" class="min-w-0"><div class="text-xs uppercase text-faint">Comment</div><div class="text-foam text-xs truncate" :title="h.comment">{{ h.comment }}</div></div>
            </div>
            <div v-if="cleanCreatedBy(h.createdBy)" class="mt-2 font-mono text-xs text-(--color-muted) overflow-x-auto whitespace-nowrap">{{ cleanCreatedBy(h.createdBy) }}</div>
            <div v-if="h.digest" class="mt-1 font-mono text-xs text-faint truncate" :title="h.digest">{{ h.digest }}</div>
          </div>
        </div>
      </div>
    </template>

    <!-- Dockerfile modal -->
    <UModal v-model:open="dockerfileOpen" title="Reconstructed Dockerfile" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="flex justify-end mb-2">
          <UButton icon="i-lucide-copy" size="xs" color="neutral" variant="soft" label="Copy" @click="copyText(dockerfile)" />
        </div>
        <pre class="max-h-[60vh] overflow-auto rounded-lg bg-surface-2 p-4 font-mono text-xs text-(--color-muted) whitespace-pre-wrap">{{ dockerfile }}</pre>
      </template>
    </UModal>
  </div>
</template>
