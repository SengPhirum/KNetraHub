<script setup lang="ts">
// Doc editor: page tree sidebar, plain-Markdown-source editor with explicit
// save (optimistic concurrency), and per-page version history with restore.
const route = useRoute()
const docId = computed(() => String(route.params.id))
const { canUseDocs, canDelete } = useWork()
const toast = useToast()

const { data: doc, status, error, refresh } = useAsyncData(
  () => `workDoc:${docId.value}`,
  () => $fetch<any>(`/api/work/v1/docs/${docId.value}`),
  { server: false, watch: [docId] }
)

const selectedPageId = ref<string | null>(null)
watch(doc, (d) => {
  if (!d) return
  const requested = String(route.query.page || '')
  const flat: any[] = []
  const walk = (pages: any[]) => pages.forEach((p) => { flat.push(p); walk(p.children || []) })
  walk(d.pages || [])
  if (requested && flat.some((p) => p.id === requested)) selectedPageId.value = requested
  else if (!selectedPageId.value || !flat.some((p) => p.id === selectedPageId.value)) selectedPageId.value = flat[0]?.id || null
}, { immediate: true })

const { data: page, refresh: refreshPage } = useAsyncData(
  () => `workDocPage:${selectedPageId.value}`,
  () => selectedPageId.value ? $fetch<any>(`/api/work/v1/doc-pages/${selectedPageId.value}`) : Promise.resolve(null),
  { server: false, watch: [selectedPageId] }
)

const titleDraft = ref('')
const contentDraft = ref('')
const dirty = ref(false)
watch(page, (p) => {
  if (p) { titleDraft.value = p.title; contentDraft.value = p.content; dirty.value = false }
}, { immediate: true })

function fail(e: any, what: string) {
  toast.add({ title: `Could not ${what}`, description: e?.data?.statusMessage || e?.message, color: 'error' })
}

const saving = ref(false)
async function savePage() {
  if (!page.value) return
  saving.value = true
  try {
    await $fetch(`/api/work/v1/doc-pages/${page.value.id}`, {
      method: 'PATCH',
      body: { title: titleDraft.value, content: contentDraft.value, version: page.value.version }
    })
    dirty.value = false
    await Promise.all([refreshPage(), refresh()])
    toast.add({ title: 'Page saved', color: 'success' })
  } catch (e: any) { fail(e, 'save page') } finally { saving.value = false }
}

const newPage = ref('')
async function addPage(parentPageId: string | null = null) {
  if (!newPage.value.trim()) return
  try {
    const result = await $fetch<any>(`/api/work/v1/docs/${docId.value}/pages`, {
      method: 'POST', body: { title: newPage.value, parent_page_id: parentPageId }
    })
    newPage.value = ''
    await refresh()
    selectedPageId.value = result.id
  } catch (e: any) { fail(e, 'add page') }
}

async function removePage(p: any) {
  if (!confirm(`Delete page "${p.title}" and its subpages?`)) return
  try {
    await $fetch(`/api/work/v1/doc-pages/${p.id}`, { method: 'DELETE' })
    selectedPageId.value = null
    await refresh()
  } catch (e: any) { fail(e, 'delete page') }
}

async function deleteDoc() {
  if (!confirm(`Permanently delete doc "${doc.value.title}" and every page?`)) return
  try {
    await $fetch(`/api/work/v1/docs/${docId.value}`, { method: 'DELETE' })
    toast.add({ title: 'Doc deleted', color: 'success' })
    navigateTo('/work/docs')
  } catch (e: any) { fail(e, 'delete doc') }
}

// Version history
const showVersions = ref(false)
const { data: versions, refresh: refreshVersions } = useAsyncData(
  () => `workDocVersions:${selectedPageId.value}`,
  () => selectedPageId.value && showVersions.value
    ? $fetch<any[]>(`/api/work/v1/doc-pages/${selectedPageId.value}/versions`)
    : Promise.resolve([]),
  { server: false, watch: [selectedPageId, showVersions], default: () => [] }
)
async function restore(version: number) {
  try {
    await $fetch(`/api/work/v1/doc-pages/${selectedPageId.value}/restore`, { method: 'POST', body: { version } })
    showVersions.value = false
    await Promise.all([refreshPage(), refresh(), refreshVersions()])
    toast.add({ title: `Restored version ${version}`, color: 'success' })
  } catch (e: any) { fail(e, 'restore version') }
}
</script>

<template>
  <div>
    <DataState :status="status" :error="error">
      <template v-if="doc">
        <div class="mb-1 flex items-center gap-1 text-xs text-faint">
          <NuxtLink to="/work/docs" class="hover:text-foam">Docs</NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="size-3" />
          <span>{{ doc.title }}</span>
        </div>
        <PageHeader :title="doc.title" :subtitle="`${doc.page_count} page(s)`" :icon="doc.icon || 'i-lucide-file-text'">
          <template #actions>
            <UButton v-if="page" size="sm" variant="soft" icon="i-lucide-history" @click="showVersions = true">History</UButton>
            <UButton v-if="canDelete" size="sm" variant="ghost" color="error" icon="i-lucide-trash-2" @click="deleteDoc" />
          </template>
        </PageHeader>

        <div class="grid gap-4 lg:grid-cols-4">
          <!-- Page tree -->
          <div class="panel h-fit p-3">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Pages</p>
            <div class="space-y-0.5">
              <template v-for="p in doc.pages" :key="p.id">
                <button
                  class="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition"
                  :class="selectedPageId === p.id ? 'bg-beacon/10 text-foam' : 'text-(--color-muted) hover:bg-surface'"
                  @click="selectedPageId = p.id"
                >
                  <UIcon name="i-lucide-file" class="size-3.5 shrink-0" />
                  <span class="flex-1 truncate">{{ p.title }}</span>
                </button>
                <button
                  v-for="child in p.children" :key="child.id"
                  class="flex w-full items-center gap-1.5 rounded py-1 pl-7 pr-2 text-left text-sm transition"
                  :class="selectedPageId === child.id ? 'bg-beacon/10 text-foam' : 'text-(--color-muted) hover:bg-surface'"
                  @click="selectedPageId = child.id"
                >
                  <UIcon name="i-lucide-corner-down-right" class="size-3 shrink-0" />
                  <span class="flex-1 truncate">{{ child.title }}</span>
                </button>
              </template>
            </div>
            <div v-if="canUseDocs" class="mt-2 flex gap-1.5">
              <UInput v-model="newPage" size="xs" class="flex-1" placeholder="New page…" @keydown.enter="addPage(null)" />
              <UButton size="xs" variant="soft" icon="i-lucide-plus" @click="addPage(null)" />
            </div>
          </div>

          <!-- Editor -->
          <div class="lg:col-span-3">
            <div v-if="page" class="panel p-4">
              <div class="mb-3 flex items-center gap-2">
                <UInput
                  v-model="titleDraft" :disabled="!canUseDocs" size="lg" class="flex-1"
                  variant="none" :ui="{ base: 'font-display text-lg font-semibold px-0' }"
                  @update:model-value="dirty = true"
                />
                <UButton v-if="canUseDocs" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" title="Delete page" @click="removePage(page)" />
              </div>
              <UTextarea
                v-model="contentDraft" :rows="22" :disabled="!canUseDocs" class="w-full font-mono text-sm"
                placeholder="Write in Markdown… content is stored as source and versioned on every save."
                @update:model-value="dirty = true"
              />
              <div class="mt-3 flex items-center justify-between">
                <p class="text-xs text-faint">
                  v{{ page.version }} · last edited {{ workDateTime(page.updated_at) }} by {{ page.updated_by || page.created_by }}
                </p>
                <UButton v-if="canUseDocs" size="sm" :loading="saving" :disabled="!dirty" icon="i-lucide-save" @click="savePage">Save page</UButton>
              </div>
            </div>
            <div v-else class="panel p-10 text-center text-sm text-faint">Select or create a page.</div>
          </div>
        </div>

        <!-- Version history -->
        <UModal v-model:open="showVersions" title="Page history" :ui="{ content: 'max-w-lg' }">
          <template #body>
            <div v-if="versions?.length" class="space-y-1.5">
              <div v-for="v in versions" :key="v.version" class="flex items-center gap-2 rounded-lg bg-surface/60 px-3 py-2 ring-1 ring-hull">
                <span class="font-mono text-xs text-foam">v{{ v.version }}</span>
                <span class="flex-1 truncate text-sm text-(--color-muted)">{{ v.title }}</span>
                <span class="text-xs text-faint">{{ workDateTime(v.saved_at) }} · {{ v.saved_by }}</span>
                <UButton v-if="canUseDocs" size="xs" variant="soft" @click="restore(v.version)">Restore</UButton>
              </div>
            </div>
            <p v-else class="text-sm text-faint">No earlier versions — history appears after the first save.</p>
          </template>
        </UModal>
      </template>
    </DataState>
  </div>
</template>
