<script setup lang="ts">
// Full-page task view — deep-link target for notifications and sharing.
// Reuses the panel component in an always-open slideover-less arrangement by
// simply opening the panel on mount; the page itself shows a lightweight
// summary so the URL is meaningful even after the panel closes.
const route = useRoute()
const taskId = computed(() => String(route.params.id))

const { data: task, status, error, refresh } = useAsyncData(
  () => `workTaskPage:${taskId.value}`,
  () => $fetch<any>(`/api/work/v1/tasks/${taskId.value}`),
  { server: false, watch: [taskId] }
)

const panelOpen = ref(true)
const panelTaskId = ref<string | null>(null)
watch(taskId, (id) => { panelTaskId.value = id; panelOpen.value = true }, { immediate: true })
function navigate(id: string) { navigateTo(`/work/tasks/${id}`) }
</script>

<template>
  <div>
    <DataState :status="status" :error="error">
      <template v-if="task">
        <div class="mb-1 flex items-center gap-1 text-xs text-faint">
          <NuxtLink to="/work/spaces" class="hover:text-foam">Spaces</NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="size-3" />
          <NuxtLink :to="`/work/spaces/${task.space_id}`" class="hover:text-foam">{{ task.space_name }}</NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="size-3" />
          <NuxtLink :to="`/work/lists/${task.list_id}`" class="hover:text-foam">{{ task.list_name }}</NuxtLink>
        </div>
        <PageHeader :title="task.name" :subtitle="task.custom_id || task.id" :icon="task.type_icon || 'i-lucide-circle-check'">
          <template #actions>
            <WorkStatusBadge :name="task.status_name" :color="task.status_color" />
            <UButton size="sm" variant="soft" icon="i-lucide-panel-right-open" @click="panelOpen = true">Open details</UButton>
          </template>
        </PageHeader>

        <div class="panel p-4">
          <div class="mb-3 flex flex-wrap items-center gap-4 text-sm">
            <span class="flex items-center gap-1.5"><span class="text-xs text-faint">Assignees</span> <WorkAssignees :assignees="task.assignees || []" /></span>
            <span class="flex items-center gap-1.5"><span class="text-xs text-faint">Due</span> <WorkDueDate :task="task" /></span>
            <span class="flex items-center gap-1.5"><span class="text-xs text-faint">Priority</span> <WorkPriority :priority="task.priority" show-label /></span>
            <span class="flex items-center gap-1.5 text-xs text-faint">Created {{ workShortDate(task.created_at) }} by {{ task.created_by }}</span>
          </div>
          <p v-if="task.description" class="whitespace-pre-wrap break-words text-sm text-(--color-muted)">{{ task.description }}</p>
          <p v-else class="text-sm text-faint">No description.</p>
        </div>
      </template>
    </DataState>

    <WorkTaskPanel v-model:open="panelOpen" :task-id="panelTaskId" @updated="refresh" @navigate="navigate" />
  </div>
</template>
