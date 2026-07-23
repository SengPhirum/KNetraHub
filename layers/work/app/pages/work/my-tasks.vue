<script setup lang="ts">
// My Tasks: overdue / today / upcoming / unscheduled buckets + recently done.
const { data, status, error, refresh } = useAsyncData('workMyTasks',
  () => $fetch<any>('/api/work/v1/my-tasks'), { server: false })

const panelTaskId = ref<string | null>(null)
const panelOpen = ref(false)
function openTask(id: string) { panelTaskId.value = id; panelOpen.value = true }

const buckets = computed(() => [
  { key: 'overdue', label: 'Overdue', icon: 'i-lucide-alarm-clock', accent: 'text-rose-400', tasks: data.value?.overdue || [] },
  { key: 'today', label: 'Today', icon: 'i-lucide-sun', accent: 'text-amber-400', tasks: data.value?.today || [] },
  { key: 'upcoming', label: 'Upcoming', icon: 'i-lucide-calendar-days', accent: 'text-sky-400', tasks: data.value?.upcoming || [] },
  { key: 'unscheduled', label: 'No due date', icon: 'i-lucide-calendar-off', accent: 'text-faint', tasks: data.value?.unscheduled || [] }
])
const empty = computed(() => buckets.value.every((b) => !b.tasks.length) && !(data.value?.recently_done || []).length)
</script>

<template>
  <div>
    <PageHeader title="My Tasks" subtitle="Everything assigned to you, ordered by urgency" icon="i-lucide-circle-user" />
    <DataState :status="status" :error="error" :empty="empty" empty-label="Nothing assigned to you — enjoy the quiet." empty-icon="i-lucide-coffee">
      <div class="space-y-5">
        <div v-for="bucket in buckets" :key="bucket.key">
          <template v-if="bucket.tasks.length">
            <p class="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold text-foam">
              <UIcon :name="bucket.icon" class="size-4" :class="bucket.accent" />
              {{ bucket.label }} <span class="text-xs font-normal text-faint">{{ bucket.tasks.length }}</span>
            </p>
            <div class="panel divide-y divide-hull/60 p-1">
              <WorkTaskRow v-for="t in bucket.tasks" :key="t.id" :task="t" show-location @open="openTask" />
            </div>
          </template>
        </div>

        <div v-if="data?.recently_done?.length">
          <p class="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold text-foam">
            <UIcon name="i-lucide-check-check" class="size-4 text-emerald-400" />
            Recently done <span class="text-xs font-normal text-faint">{{ data.recently_done.length }}</span>
          </p>
          <div class="panel divide-y divide-hull/60 p-1 opacity-70">
            <WorkTaskRow v-for="t in data.recently_done" :key="t.id" :task="t" show-location @open="openTask" />
          </div>
        </div>
      </div>
    </DataState>
    <WorkTaskPanel v-model:open="panelOpen" :task-id="panelTaskId" @updated="refresh" @navigate="openTask" />
  </div>
</template>
