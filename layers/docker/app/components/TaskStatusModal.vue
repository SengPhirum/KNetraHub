<script setup lang="ts">
// Popup shown when a Task distribution status pill is clicked on the Dock
// dashboard - lists every task currently in that state so "3 failed" is
// something you can act on, not just a number.
const props = defineProps<{
  state: string
  tasks: any[]
  loading?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const { relative } = useFormat()

const stateLabel = computed(() => {
  const s = props.state || ''
  return s ? s[0]!.toUpperCase() + s.slice(1) : ''
})

function goToTask(t: any) {
  open.value = false
  navigateTo(`/tasks/${t.id}`)
}
</script>

<template>
  <UModal v-model:open="open" :title="`Tasks — ${stateLabel}`" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div v-if="props.loading" class="flex items-center justify-center py-10 text-sm text-(--color-muted)">
        Loading tasks…
      </div>
      <div v-else-if="!props.tasks.length" class="flex items-center justify-center py-10 text-sm text-(--color-muted)">
        No tasks in this state.
      </div>
      <div v-else class="max-h-[26rem] overflow-y-auto overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="border-b border-hull text-xs uppercase tracking-wide text-faint">
            <tr>
              <th class="px-3 py-2 font-medium">Task</th>
              <th class="px-3 py-2 font-medium">Node</th>
              <th class="px-3 py-2 font-medium">Message</th>
              <th class="px-3 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-hull">
            <tr
              v-for="t in props.tasks"
              :key="t.id"
              class="cursor-pointer align-top transition hover:bg-surface-2/60"
              tabindex="0"
              role="link"
              :aria-label="`Open task ${t.service}`"
              @click="goToTask(t)"
              @keydown.enter="goToTask(t)"
            >
              <td class="px-3 py-2">
                <p class="truncate font-medium text-foam">
                  {{ t.service || '—' }}<span v-if="t.slot != null" class="text-faint">.{{ t.slot }}</span>
                </p>
                <p class="mt-0.5 truncate font-mono text-xs text-faint">{{ t.image || '—' }}</p>
              </td>
              <td class="px-3 py-2 font-mono text-xs text-(--color-muted)">{{ t.node || '—' }}</td>
              <td class="px-3 py-2 max-w-64 truncate text-xs text-(--color-muted)" :title="t.message || ''">{{ t.message || '—' }}</td>
              <td class="px-3 py-2 whitespace-nowrap text-xs text-faint">{{ relative(t.timestamp) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </UModal>
</template>
