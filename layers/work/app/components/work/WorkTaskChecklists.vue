<script setup lang="ts">
// Checklists on a task: add/rename/delete lists, add/toggle/remove items
// (one nesting level), per-item assignee. Emits `changed` after any write.
const props = defineProps<{ task: any; members: { username: string }[] }>()
const emit = defineEmits<{ changed: [] }>()
const { canUpdate } = useWork()
const toast = useToast()

const newChecklist = ref('')
const newItem = reactive<Record<string, string>>({})

function fail(e: any, what: string) {
  toast.add({ title: `Could not ${what}`, description: e?.data?.statusMessage || e?.message, color: 'error' })
}

async function addChecklist() {
  if (!newChecklist.value.trim()) return
  try {
    await $fetch(`/api/work/v1/tasks/${props.task.id}/checklists`, { method: 'POST', body: { name: newChecklist.value } })
    newChecklist.value = ''
    emit('changed')
  } catch (e: any) { fail(e, 'add checklist') }
}

async function removeChecklist(checklist: any) {
  try {
    await $fetch(`/api/work/v1/checklists/${checklist.id}`, { method: 'DELETE' })
    emit('changed')
  } catch (e: any) { fail(e, 'delete checklist') }
}

async function addItem(checklist: any) {
  const name = (newItem[checklist.id] || '').trim()
  if (!name) return
  try {
    await $fetch(`/api/work/v1/checklists/${checklist.id}/items`, { method: 'POST', body: { name } })
    newItem[checklist.id] = ''
    emit('changed')
  } catch (e: any) { fail(e, 'add item') }
}

async function toggleItem(item: any) {
  try {
    await $fetch(`/api/work/v1/checklist-items/${item.id}`, { method: 'PATCH', body: { done: !item.done } })
    emit('changed')
  } catch (e: any) { fail(e, 'update item') }
}

async function assignItem(item: any, assignee: string | null) {
  try {
    await $fetch(`/api/work/v1/checklist-items/${item.id}`, { method: 'PATCH', body: { assignee } })
    emit('changed')
  } catch (e: any) { fail(e, 'assign item') }
}

async function removeItem(item: any) {
  try {
    await $fetch(`/api/work/v1/checklist-items/${item.id}`, { method: 'DELETE' })
    emit('changed')
  } catch (e: any) { fail(e, 'delete item') }
}

function progress(checklist: any): string {
  const total = (checklist.items || []).length
  const done = (checklist.items || []).filter((i: any) => i.done).length
  return `${done}/${total}`
}
</script>

<template>
  <div class="space-y-3">
    <div v-for="cl in task.checklists || []" :key="cl.id" class="rounded-lg bg-surface/60 p-3 ring-1 ring-hull">
      <div class="mb-2 flex items-center justify-between gap-2">
        <p class="text-sm font-medium text-foam">{{ cl.name }} <span class="text-xs text-faint">{{ progress(cl) }}</span></p>
        <UButton v-if="canUpdate" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="removeChecklist(cl)" />
      </div>
      <div class="space-y-1">
        <div v-for="item in cl.items" :key="item.id" class="group flex items-center gap-2" :class="item.parent_item_id ? 'pl-6' : ''">
          <UCheckbox :model-value="item.done" :disabled="!canUpdate" @update:model-value="toggleItem(item)" />
          <span class="flex-1 text-sm" :class="item.done ? 'text-faint line-through' : 'text-(--color-muted)'">{{ item.name }}</span>
          <span v-if="item.assignee" class="flex size-5 items-center justify-center rounded-full text-[9px] font-semibold text-white" :style="{ backgroundColor: userColor(item.assignee) }" :title="item.assignee">{{ userInitials(item.assignee) }}</span>
          <UDropdownMenu
            v-if="canUpdate"
            :items="[
              members.map(m => ({ label: m.username, onSelect: () => assignItem(item, m.username) })),
              [{ label: 'Unassign', icon: 'i-lucide-user-x', onSelect: () => assignItem(item, null) },
               { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeItem(item) }]
            ]"
          >
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-ellipsis" class="opacity-0 group-hover:opacity-100" />
          </UDropdownMenu>
        </div>
      </div>
      <div v-if="canUpdate" class="mt-2 flex gap-2">
        <UInput v-model="newItem[cl.id]" size="xs" class="flex-1" placeholder="Add item…" @keydown.enter="addItem(cl)" />
        <UButton size="xs" variant="soft" icon="i-lucide-plus" @click="addItem(cl)" />
      </div>
    </div>

    <div v-if="canUpdate" class="flex gap-2">
      <UInput v-model="newChecklist" size="sm" class="flex-1" placeholder="New checklist…" @keydown.enter="addChecklist" />
      <UButton size="sm" variant="soft" icon="i-lucide-list-plus" @click="addChecklist">Add</UButton>
    </div>
  </div>
</template>
