<script setup lang="ts">
// Threaded comment section for a task: replies, reactions, assigned comments
// with resolve, edit/delete. Bodies render as plain text (pre-wrap) — no HTML.
const props = defineProps<{ taskId: string; members: { username: string }[] }>()
const { canComment } = useWork()
const { user } = useAuth()
const toast = useToast()

const { data, status, error, refresh } = useAsyncData(
  () => `workComments:${props.taskId}`,
  () => $fetch<any>(`/api/work/v1/tasks/${props.taskId}/comments`),
  { server: false, watch: [() => props.taskId], default: () => ({ items: [], hasMore: false }) }
)

const draft = ref('')
const replyTo = ref<any | null>(null)
const assignTo = ref<string | null>(null)
const sending = ref(false)
const editing = ref<string | null>(null)
const editDraft = ref('')

const roots = computed(() => (data.value?.items || []).filter((c: any) => !c.parent_id))
const repliesOf = (id: string) => (data.value?.items || []).filter((c: any) => c.parent_id === id)
const memberItems = computed(() => props.members.map((m) => m.username))

async function send() {
  if (!draft.value.trim()) return
  sending.value = true
  try {
    await $fetch(`/api/work/v1/tasks/${props.taskId}/comments`, {
      method: 'POST',
      body: { body: draft.value, parent_id: replyTo.value?.id || null, assigned_to: assignTo.value || null }
    })
    draft.value = ''
    replyTo.value = null
    assignTo.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not post comment', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { sending.value = false }
}

async function react(comment: any, emoji: string) {
  try {
    await $fetch(`/api/work/v1/comments/${comment.id}/reactions`, { method: 'POST', body: { emoji } })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not react', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}

async function resolve(comment: any, resolved: boolean) {
  try {
    await $fetch(`/api/work/v1/comments/${comment.id}`, { method: 'PATCH', body: { resolved } })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not update', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}

function startEdit(comment: any) {
  editing.value = comment.id
  editDraft.value = comment.body
}

async function saveEdit(comment: any) {
  try {
    await $fetch(`/api/work/v1/comments/${comment.id}`, { method: 'PATCH', body: { body: editDraft.value } })
    editing.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not edit comment', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}

async function remove(comment: any) {
  try {
    await $fetch(`/api/work/v1/comments/${comment.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not delete comment', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}

function reactionSummary(comment: any): { emoji: string; count: number; mine: boolean }[] {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>()
  for (const r of comment.reactions || []) {
    const entry = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false }
    entry.count++
    if (r.username?.toLowerCase() === user.value?.username?.toLowerCase()) entry.mine = true
    map.set(r.emoji, entry)
  }
  return [...map.values()]
}
</script>

<template>
  <div>
    <DataState :status="status" :error="error" :empty="!roots.length" empty-label="No comments yet." empty-icon="i-lucide-message-circle">
      <div class="space-y-3">
        <div v-for="c in roots" :key="c.id" class="rounded-lg bg-surface/60 p-3 ring-1 ring-hull">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white" :style="{ backgroundColor: userColor(c.author) }">{{ userInitials(c.author) }}</span>
              <span class="truncate text-sm font-medium text-foam">{{ c.author }}</span>
              <span class="shrink-0 text-xs text-faint">{{ workDateTime(c.created_at) }}</span>
              <span v-if="c.edited_at" class="shrink-0 text-[10px] text-faint">(edited)</span>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <span v-if="c.assigned_to && !c.resolved_at" class="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400 ring-1 ring-inset ring-amber-500/30">→ {{ c.assigned_to }}</span>
              <span v-if="c.resolved_at" class="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400 ring-1 ring-inset ring-emerald-500/30">resolved</span>
            </div>
          </div>

          <div v-if="editing === c.id" class="mt-2 space-y-2">
            <UTextarea v-model="editDraft" :rows="3" class="w-full" />
            <div class="flex justify-end gap-2">
              <UButton size="xs" color="neutral" variant="ghost" @click="editing = null">Cancel</UButton>
              <UButton size="xs" @click="saveEdit(c)">Save</UButton>
            </div>
          </div>
          <p v-else class="mt-2 whitespace-pre-wrap break-words text-sm text-(--color-muted)">{{ c.body }}</p>

          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              v-for="r in reactionSummary(c)" :key="r.emoji"
              class="rounded-full px-1.5 py-0.5 text-xs ring-1 ring-inset transition"
              :class="r.mine ? 'bg-beacon/10 ring-beacon/40' : 'ring-hull hover:ring-beacon/40'"
              @click="react(c, r.emoji)"
            >{{ r.emoji }} {{ r.count }}</button>
            <template v-if="canComment">
              <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-smile-plus" @click="react(c, '👍')" />
              <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-reply" @click="replyTo = c" />
              <UButton v-if="c.assigned_to && !c.resolved_at" size="xs" variant="ghost" color="success" icon="i-lucide-check" title="Resolve" @click="resolve(c, true)" />
              <UButton v-if="c.resolved_at" size="xs" variant="ghost" color="neutral" icon="i-lucide-rotate-ccw" title="Reopen" @click="resolve(c, false)" />
              <UButton v-if="c.author?.toLowerCase() === user?.username?.toLowerCase()" size="xs" variant="ghost" color="neutral" icon="i-lucide-pencil" @click="startEdit(c)" />
              <UButton v-if="c.author?.toLowerCase() === user?.username?.toLowerCase()" size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="remove(c)" />
            </template>
          </div>

          <div v-if="repliesOf(c.id).length" class="mt-2 space-y-2 border-l-2 border-hull pl-3">
            <div v-for="r in repliesOf(c.id)" :key="r.id">
              <div class="flex items-center gap-2">
                <span class="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white" :style="{ backgroundColor: userColor(r.author) }">{{ userInitials(r.author) }}</span>
                <span class="text-xs font-medium text-foam">{{ r.author }}</span>
                <span class="text-[10px] text-faint">{{ workDateTime(r.created_at) }}</span>
                <UButton
                  v-if="r.author?.toLowerCase() === user?.username?.toLowerCase()"
                  size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="remove(r)"
                />
              </div>
              <p class="mt-1 whitespace-pre-wrap break-words text-sm text-(--color-muted)">{{ r.body }}</p>
            </div>
          </div>
        </div>
      </div>
    </DataState>

    <div v-if="canComment" class="mt-3 space-y-2">
      <div v-if="replyTo" class="flex items-center gap-2 text-xs text-faint">
        <UIcon name="i-lucide-reply" class="size-3.5" />
        Replying to {{ replyTo.author }}
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" @click="replyTo = null" />
      </div>
      <UTextarea v-model="draft" :rows="2" class="w-full" placeholder="Write a comment… use @username to mention" @keydown.ctrl.enter="send" />
      <div class="flex items-center justify-between gap-2">
        <USelectMenu v-model="assignTo" :items="memberItems" placeholder="Assign to…" class="w-44" size="xs" />
        <UButton size="sm" icon="i-lucide-send" :loading="sending" :disabled="!draft.trim()" @click="send">Comment</UButton>
      </div>
    </div>
  </div>
</template>
