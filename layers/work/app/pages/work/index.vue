<script setup lang="ts">
// Work home: my-task stat cards, favorites, and recent workspace activity.
const { data, status, error } = useAsyncData('workOverview',
  () => $fetch<any>('/api/work/v1/overview'), { server: false })

const panelTaskId = ref<string | null>(null)
const panelOpen = ref(false)
function openTask(id: string) { panelTaskId.value = id; panelOpen.value = true }

const favIcon: Record<string, string> = {
  space: 'i-lucide-layout-grid', folder: 'i-lucide-folder', list: 'i-lucide-list',
  task: 'i-lucide-circle-check', doc: 'i-lucide-file-text', view: 'i-lucide-eye'
}
const favLink = (f: any) => f.entity_type === 'space' ? `/work/spaces/${f.entity_id}`
  : f.entity_type === 'list' ? `/work/lists/${f.entity_id}`
    : f.entity_type === 'task' ? `/work/tasks/${f.entity_id}`
      : f.entity_type === 'doc' ? `/work/docs/${f.entity_id}` : '/work/spaces'
</script>

<template>
  <div>
    <PageHeader title="Work" subtitle="Centralized tasks, projects, and team collaboration" icon="i-lucide-panels-top-left">
      <template #actions>
        <UButton to="/work/my-tasks" size="sm" variant="soft" icon="i-lucide-circle-user">My Tasks</UButton>
        <UButton to="/work/spaces" size="sm" icon="i-lucide-layout-grid">Spaces</UButton>
      </template>
    </PageHeader>

    <DataState :status="status" :error="error">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <NuxtLink to="/work/my-tasks" class="panel p-4 transition hover:ring-1 hover:ring-beacon/40">
          <p class="text-xs text-faint">Assigned to me</p>
          <p class="mt-1 font-display text-2xl font-semibold text-foam">{{ data?.me?.assigned ?? 0 }}</p>
        </NuxtLink>
        <NuxtLink to="/work/my-tasks" class="panel p-4 transition hover:ring-1 hover:ring-beacon/40">
          <p class="text-xs text-faint">Due today</p>
          <p class="mt-1 font-display text-2xl font-semibold" :class="data?.me?.due_today ? 'text-amber-400' : 'text-foam'">{{ data?.me?.due_today ?? 0 }}</p>
        </NuxtLink>
        <NuxtLink to="/work/my-tasks" class="panel p-4 transition hover:ring-1 hover:ring-beacon/40">
          <p class="text-xs text-faint">Overdue</p>
          <p class="mt-1 font-display text-2xl font-semibold" :class="data?.me?.overdue ? 'text-rose-400' : 'text-foam'">{{ data?.me?.overdue ?? 0 }}</p>
        </NuxtLink>
        <div class="panel p-4">
          <p class="text-xs text-faint">Done this week</p>
          <p class="mt-1 font-display text-2xl font-semibold text-emerald-400">{{ data?.me?.done_this_week ?? 0 }}</p>
        </div>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <div class="panel p-4">
            <p class="mb-3 text-sm font-semibold text-foam">Recent activity</p>
            <div v-if="data?.activity?.length" class="space-y-2">
              <div v-for="a in data.activity" :key="a.id" class="flex items-baseline gap-2 text-sm">
                <span class="shrink-0 text-xs text-faint">{{ workDateTime(a.ts) }}</span>
                <span class="shrink-0 font-medium text-foam">{{ a.actor }}</span>
                <span class="min-w-0 flex-1 truncate text-(--color-muted)">
                  {{ a.action }}{{ a.field ? ` ${a.field}` : '' }}
                  <template v-if="a.task_id">
                    on <button class="text-beacon hover:underline" @click="openTask(a.task_id)">{{ a.custom_id ? `${a.custom_id} · ` : '' }}{{ a.task_name || 'task' }}</button>
                  </template>
                  <template v-else-if="a.detail"> · {{ a.detail }}</template>
                </span>
              </div>
            </div>
            <p v-else class="text-sm text-faint">No activity yet — create a space and your first tasks.</p>
          </div>
        </div>

        <div class="space-y-4">
          <div class="panel p-4">
            <p class="mb-3 text-sm font-semibold text-foam">Favorites</p>
            <div v-if="data?.favorites?.length" class="space-y-1">
              <component
                :is="f.entity_type === 'task' ? 'button' : 'NuxtLink'"
                v-for="f in data.favorites" :key="f.id"
                v-bind="f.entity_type === 'task' ? {} : { to: favLink(f) }"
                class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-(--color-muted) transition hover:bg-surface hover:text-foam"
                @click="f.entity_type === 'task' && openTask(f.entity_id)"
              >
                <UIcon :name="favIcon[f.entity_type] || 'i-lucide-star'" class="size-4 text-amber-400" />
                <span class="truncate">{{ f.name }}</span>
              </component>
            </div>
            <p v-else class="text-sm text-faint">Star spaces, lists, tasks, or docs to pin them here.</p>
          </div>

          <div class="panel p-4">
            <p class="mb-3 text-sm font-semibold text-foam">Workspace</p>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div><p class="text-xs text-faint">Spaces</p><p class="text-foam">{{ data?.counts?.spaces ?? 0 }}</p></div>
              <div><p class="text-xs text-faint">Lists</p><p class="text-foam">{{ data?.counts?.lists ?? 0 }}</p></div>
              <div><p class="text-xs text-faint">Open tasks</p><p class="text-foam">{{ data?.counts?.open_tasks ?? 0 }}</p></div>
              <div><p class="text-xs text-faint">Docs</p><p class="text-foam">{{ data?.counts?.docs ?? 0 }}</p></div>
            </div>
          </div>
        </div>
      </div>
    </DataState>

    <WorkTaskPanel v-model:open="panelOpen" :task-id="panelTaskId" @navigate="openTask" />
  </div>
</template>
