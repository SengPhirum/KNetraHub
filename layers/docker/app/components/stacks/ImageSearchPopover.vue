<script setup lang="ts">
// Floating image picker for the deploy-stack form: browse the registered
// Docker registries, text-search their repositories, drill into a repo's tags
// and emit the fully-qualified image ref (host/repo:tag) back to the caller,
// which auto-fills the service's Image input.
defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ select: [image: string] }>()

interface RegistryRow { id: string; name: string; url: string }

const open = ref(false)
const search = ref('')

const registries = ref<RegistryRow[]>([])
const registriesLoaded = ref(false)
const loadingRegistries = ref(false)
const selectedRegistryId = ref<string>('')

const repos = ref<string[]>([])
const loadingRepos = ref(false)
const repoError = ref('')
const repoCache = new Map<string, string[]>()

const selectedRepo = ref<string | null>(null)
const tags = ref<string[]>([])
const loadingTags = ref(false)
const tagError = ref('')

const selectedRegistry = computed(() => registries.value.find((r) => r.id === selectedRegistryId.value) || null)
const registryItems = computed(() => registries.value.map((r) => ({ label: r.name, value: r.id })))

// "registry.example.com[:port]" - the prefix a private-registry image ref
// needs. Mirrors registryBaseFromUrl server-side, but keeps only the host.
const registryHost = computed(() => {
  const url = selectedRegistry.value?.url || ''
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
  }
})

const filteredRepos = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = q ? repos.value.filter((r) => r.toLowerCase().includes(q)) : repos.value
  return list.slice(0, 100)
})
const filteredTags = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = q ? tags.value.filter((t) => t.toLowerCase().includes(q)) : tags.value
  return list.slice(0, 100)
})

watch(open, (isOpen) => {
  if (!isOpen) return
  search.value = ''
  selectedRepo.value = null
  tags.value = []
  tagError.value = ''
  if (!registriesLoaded.value) loadRegistries()
})

async function loadRegistries() {
  loadingRegistries.value = true
  try {
    registries.value = await $fetch<RegistryRow[]>('/api/registries')
    registriesLoaded.value = true
    if (!selectedRegistryId.value && registries.value[0]) selectedRegistryId.value = registries.value[0].id
  } catch {
    registries.value = []
  } finally {
    loadingRegistries.value = false
  }
}

watch(selectedRegistryId, (id) => {
  selectedRepo.value = null
  tags.value = []
  tagError.value = ''
  if (id) loadRepos(id)
})

async function loadRepos(id: string) {
  repoError.value = ''
  const cached = repoCache.get(id)
  if (cached) { repos.value = cached; return }
  loadingRepos.value = true
  repos.value = []
  try {
    const res = await $fetch<{ repositories: string[] }>(`/api/registries/${id}/repositories`)
    repoCache.set(id, res.repositories)
    // The registry select may have moved on while this request was in flight.
    if (selectedRegistryId.value === id) repos.value = res.repositories
  } catch (e: any) {
    if (selectedRegistryId.value === id) repoError.value = e?.data?.statusMessage || e?.message || 'Failed to list repositories'
  } finally {
    loadingRepos.value = false
  }
}

async function pickRepo(repo: string) {
  selectedRepo.value = repo
  search.value = ''
  tagError.value = ''
  tags.value = []
  loadingTags.value = true
  try {
    const res = await $fetch<{ tags: string[] }>(`/api/registries/${selectedRegistryId.value}/tags`, { query: { repo } })
    tags.value = res.tags
  } catch (e: any) {
    tagError.value = e?.data?.statusMessage || e?.message || 'Failed to list tags'
  } finally {
    loadingTags.value = false
  }
}

function backToRepos() {
  selectedRepo.value = null
  tags.value = []
  tagError.value = ''
  search.value = ''
}

function pickTag(tag: string) {
  if (!selectedRepo.value) return
  emit('select', `${registryHost.value}/${selectedRepo.value}:${tag}`)
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'end', sideOffset: 8 }">
    <UButton
      icon="i-lucide-search"
      color="neutral"
      variant="soft"
      :disabled="disabled"
      aria-label="Search registry images"
      title="Search registry images"
    />
    <template #content>
      <div class="w-96 max-w-[calc(100vw-2rem)] p-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-container" class="size-4 shrink-0 text-beacon" />
          <p class="text-sm font-semibold text-foam">Search registry images</p>
        </div>

        <div v-if="loadingRegistries" class="flex items-center justify-center gap-2 py-8 text-sm text-(--color-muted)">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Loading registries...
        </div>
        <div v-else-if="!registries.length" class="mt-3 rounded-lg border border-dashed border-hull p-5 text-center text-xs text-(--color-muted)">
          No registries registered yet. Add one under Dock &rarr; Registries first.
        </div>

        <template v-else>
          <div class="mt-3 space-y-2">
            <USelect
              v-if="registries.length > 1"
              v-model="selectedRegistryId"
              :items="registryItems"
              value-key="value"
              label-key="label"
              icon="i-lucide-server"
              class="w-full"
            />
            <p v-else class="flex items-center gap-1.5 text-xs text-faint">
              <UIcon name="i-lucide-server" class="size-3.5" />
              <span class="truncate font-mono">{{ selectedRegistry?.name }}</span>
            </p>
            <UInput
              v-model="search"
              icon="i-lucide-search"
              :placeholder="selectedRepo ? 'Filter tags' : 'Search repositories'"
              class="w-full"
              autofocus
            />
          </div>

          <!-- Tag list for the drilled-into repository -->
          <div v-if="selectedRepo" class="mt-2">
            <button type="button" class="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-xs text-faint transition hover:bg-surface-2 hover:text-foam" @click="backToRepos">
              <UIcon name="i-lucide-arrow-left" class="size-3.5 shrink-0" />
              <span class="truncate font-mono text-foam">{{ selectedRepo }}</span>
            </button>
            <div v-if="loadingTags" class="flex items-center justify-center gap-2 py-6 text-sm text-(--color-muted)">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Loading tags...
            </div>
            <p v-else-if="tagError" class="notice-danger panel-flush mt-1 p-2.5 text-xs">{{ tagError }}</p>
            <p v-else-if="!filteredTags.length" class="py-5 text-center text-xs text-(--color-muted)">No tags found.</p>
            <div v-else class="mt-1 max-h-64 space-y-0.5 overflow-y-auto">
              <button
                v-for="tag in filteredTags"
                :key="tag"
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-beacon/10 hover:text-beacon"
                @click="pickTag(tag)"
              >
                <UIcon name="i-lucide-tag" class="size-3.5 shrink-0 text-faint" />
                <span class="truncate font-mono text-xs">{{ tag }}</span>
              </button>
            </div>
          </div>

          <!-- Repository list -->
          <div v-else class="mt-2">
            <div v-if="loadingRepos" class="flex items-center justify-center gap-2 py-6 text-sm text-(--color-muted)">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Loading repositories...
            </div>
            <p v-else-if="repoError" class="notice-danger panel-flush mt-1 p-2.5 text-xs">{{ repoError }}</p>
            <p v-else-if="!filteredRepos.length" class="py-5 text-center text-xs text-(--color-muted)">
              {{ repos.length ? 'No repositories match your search.' : 'No repositories in this registry.' }}
            </p>
            <div v-else class="max-h-64 space-y-0.5 overflow-y-auto">
              <button
                v-for="repo in filteredRepos"
                :key="repo"
                type="button"
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-beacon/10 hover:text-beacon"
                @click="pickRepo(repo)"
              >
                <UIcon name="i-lucide-box" class="size-3.5 shrink-0 text-faint" />
                <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ repo }}</span>
                <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 text-faint" />
              </button>
            </div>
          </div>
        </template>
      </div>
    </template>
  </UPopover>
</template>
