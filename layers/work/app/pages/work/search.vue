<script setup lang="ts">
// Permission-aware search across tasks, comments, docs, and locations.
const q = ref('')
const debounced = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => { debounced.value = value.trim() }, 300)
})

const { data, status, error } = useAsyncData(
  () => `workSearch:${debounced.value}`,
  () => debounced.value.length >= 2
    ? $fetch<any>('/api/work/v1/search', { query: { q: debounced.value } })
    : Promise.resolve(null),
  { server: false, watch: [debounced] }
)

const panelTaskId = ref<string | null>(null)
const panelOpen = ref(false)
function openTask(id: string) { panelTaskId.value = id; panelOpen.value = true }

const locationLink = (l: any) => l.kind === 'space' ? `/work/spaces/${l.id}` : l.kind === 'list' ? `/work/lists/${l.id}` : '/work/spaces'
const empty = computed(() => data.value
  && !data.value.tasks?.length && !data.value.comments?.length
  && !data.value.docs?.length && !data.value.locations?.length)
</script>

<template>
  <div>
    <PageHeader title="Search" subtitle="Tasks, comments, docs, and locations you can access" icon="i-lucide-search" />
    <UInput v-model="q" size="lg" icon="i-lucide-search" placeholder="Search Work… (min 2 characters)" class="mb-4 w-full" autofocus />

    <div v-if="debounced.length < 2" class="panel p-10 text-center text-sm text-faint">
      Type at least two characters to search.
    </div>
    <DataState v-else :status="status" :error="error" :empty="!!empty" empty-label="No results.">
      <div v-if="data" class="space-y-5">
        <div v-if="data.locations?.length">
          <p class="mb-1.5 px-1 text-sm font-semibold text-foam">Locations</p>
          <div class="flex flex-wrap gap-2">
            <NuxtLink
              v-for="l in data.locations" :key="l.kind + l.id" :to="locationLink(l)"
              class="flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-sm text-(--color-muted) ring-1 ring-hull transition hover:text-foam hover:ring-beacon/40"
            >
              <UIcon :name="l.kind === 'space' ? 'i-lucide-layout-grid' : l.kind === 'folder' ? 'i-lucide-folder' : 'i-lucide-list'" class="size-3.5" />
              {{ l.name }}
            </NuxtLink>
          </div>
        </div>

        <div v-if="data.tasks?.length">
          <p class="mb-1.5 px-1 text-sm font-semibold text-foam">Tasks</p>
          <div class="panel divide-y divide-hull/60 p-1">
            <WorkTaskRow v-for="t in data.tasks" :key="t.id" :task="t" show-location @open="openTask" />
          </div>
        </div>

        <div v-if="data.comments?.length">
          <p class="mb-1.5 px-1 text-sm font-semibold text-foam">Comments</p>
          <div class="panel divide-y divide-hull/60">
            <button
              v-for="c in data.comments" :key="c.id"
              class="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-surface"
              @click="openTask(c.task_id)"
            >
              <span class="text-xs text-faint">{{ c.author }} on {{ c.custom_id ? `${c.custom_id} · ` : '' }}{{ c.task_name }} · {{ workDateTime(c.created_at) }}</span>
              <span class="line-clamp-2 text-sm text-(--color-muted)">{{ c.snippet }}</span>
            </button>
          </div>
        </div>

        <div v-if="data.docs?.length">
          <p class="mb-1.5 px-1 text-sm font-semibold text-foam">Docs</p>
          <div class="panel divide-y divide-hull/60">
            <NuxtLink
              v-for="d in data.docs" :key="d.page_id" :to="`/work/docs/${d.doc_id}?page=${d.page_id}`"
              class="flex items-center gap-2 px-3 py-2 text-sm transition hover:bg-surface"
            >
              <UIcon name="i-lucide-file-text" class="size-4 text-beacon" />
              <span class="text-foam">{{ d.page_title }}</span>
              <span class="text-xs text-faint">in {{ d.doc_title }} · {{ workDateTime(d.updated_at) }}</span>
            </NuxtLink>
          </div>
        </div>
      </div>
    </DataState>

    <WorkTaskPanel v-model:open="panelOpen" :task-id="panelTaskId" @navigate="openTask" />
  </div>
</template>
