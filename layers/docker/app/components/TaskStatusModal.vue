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

const { relative, bytes, cpus } = useFormat()

const stateLabel = computed(() => {
  const s = props.state || ''
  return s ? s[0]!.toUpperCase() + s.slice(1) : ''
})

function goToTask(t: any) {
  open.value = false
  navigateTo(`/tasks/${t.id}`)
}

function cpuPercent(t: any) {
  const value = t.metrics?.cpuPercent
  return value == null || !Number.isFinite(Number(value)) ? '-' : `${Number(value).toFixed(Number(value) < 10 ? 1 : 0)}%`
}

function cpuDetail(t: any) {
  return t.metrics ? cpus(Number(t.metrics.cpuPercent || 0) / 100) : ''
}

function memoryPercent(t: any) {
  const used = Number(t.metrics?.memoryUsedBytes || 0)
  const limit = Number(t.metrics?.memoryLimitBytes || 0)
  if (!used || !limit) return '-'
  const value = Math.min(100, (used / limit) * 100)
  return `${value.toFixed(value < 10 ? 1 : 0)}%`
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Tasks — ${stateLabel} (${props.tasks.length})`"
    description="Select a row to open the complete task details."
    :ui="{ content: 'w-[calc(100vw-3rem)] max-w-[110rem]' }"
  >
    <template #body>
      <div v-if="props.loading" class="flex items-center justify-center py-10 text-sm text-(--color-muted)">
        Loading tasks…
      </div>
      <div v-else-if="!props.tasks.length" class="flex items-center justify-center py-10 text-sm text-(--color-muted)">
        No tasks in this state.
      </div>
      <div v-else class="max-h-[min(80dvh,64rem)] overflow-auto rounded-lg border border-hull-soft">
        <table class="w-full min-w-[78rem] table-fixed text-left text-sm">
          <thead class="sticky top-0 z-10 border-b border-hull bg-abyss text-xs uppercase tracking-wide text-faint shadow-sm">
            <tr>
              <th class="w-64 px-4 py-3 font-medium">Task</th>
              <th class="w-40 px-4 py-3 font-medium">Node</th>
              <th class="w-28 px-4 py-3 font-medium">Desired</th>
              <th class="w-28 px-4 py-3 font-medium">CPU</th>
              <th class="w-32 px-4 py-3 font-medium">Memory</th>
              <th class="px-4 py-3 font-medium">Message</th>
              <th class="w-36 px-4 py-3 font-medium">Updated</th>
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
              <td class="px-4 py-3">
                <p class="break-words font-medium text-foam">
                  {{ t.service || '—' }}<span v-if="t.slot != null" class="text-faint">.{{ t.slot }}</span>
                </p>
                <p class="mt-1 break-all font-mono text-xs text-faint" :title="t.image || ''">{{ t.image || '—' }}</p>
                <p class="mt-1 truncate font-mono text-[10px] text-faint" :title="t.id">{{ t.id }}</p>
              </td>
              <td class="px-4 py-3 font-mono text-xs text-(--color-muted)">
                <p class="break-words">{{ t.node || '—' }}</p>
                <p v-if="t.nodeId" class="mt-1 truncate text-[10px] text-faint" :title="t.nodeId">{{ t.nodeId }}</p>
              </td>
              <td class="px-4 py-3"><StatusBadge :state="t.desiredState" /></td>
              <td class="px-4 py-3">
                <p class="font-mono text-sm text-foam">{{ cpuPercent(t) }}</p>
                <p v-if="cpuDetail(t)" class="mt-1 font-mono text-xs text-faint">{{ cpuDetail(t) }}</p>
              </td>
              <td class="px-4 py-3">
                <p class="font-mono text-sm text-foam">{{ memoryPercent(t) }}</p>
                <p v-if="t.metrics" class="mt-1 font-mono text-xs text-faint">{{ bytes(t.metrics.memoryUsedBytes) }}</p>
              </td>
              <td class="px-4 py-3 text-xs leading-5 text-(--color-muted)">
                <p class="break-words" :title="t.message || ''">{{ t.message || '—' }}</p>
              </td>
              <td class="px-4 py-3 text-xs text-faint">
                <p class="whitespace-nowrap">{{ relative(t.timestamp) }}</p>
                <p class="mt-1 break-words font-mono text-[10px]" :title="t.timestamp">{{ t.timestamp || '—' }}</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </UModal>
</template>
