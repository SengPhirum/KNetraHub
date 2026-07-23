<script setup lang="ts">
// Spaces browser: the full hierarchy tree (spaces → folders → lists) with
// create-space / create-list entry points and favorites.
const { canCreate } = useWork()
const toast = useToast()

const { data: spaces, status, error, refresh } = useAsyncData('workSpaces',
  () => $fetch<any[]>('/api/work/v1/spaces'), { server: false, default: () => [] })

const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ name: '', description: '', task_prefix: '', private: false, color: '' })

async function createSpace() {
  creating.value = true
  try {
    await $fetch('/api/work/v1/spaces', { method: 'POST', body: { ...form, color: form.color || undefined, task_prefix: form.task_prefix || undefined } })
    toast.add({ title: 'Space created', color: 'success' })
    showCreate.value = false
    Object.assign(form, { name: '', description: '', task_prefix: '', private: false, color: '' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not create space', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { creating.value = false }
}

async function favorite(entityType: string, entityId: string) {
  try {
    const result = await $fetch<any>('/api/work/v1/favorites', { method: 'POST', body: { entity_type: entityType, entity_id: entityId } })
    toast.add({ title: result.favorited ? 'Added to favorites' : 'Removed from favorites', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not update favorites', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}
</script>

<template>
  <div>
    <PageHeader title="Spaces" subtitle="Workspace hierarchy — spaces, folders, and lists" icon="i-lucide-layout-grid">
      <template v-if="canCreate" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="showCreate = true">New space</UButton>
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!spaces?.length" empty-label="No spaces yet — create the first one." empty-icon="i-lucide-layout-grid">
      <div class="space-y-4">
        <div v-for="space in spaces" :key="space.id" class="panel p-4">
          <div class="mb-3 flex items-center gap-2">
            <span class="flex size-7 items-center justify-center rounded-lg text-xs font-semibold text-white" :style="{ backgroundColor: space.color || '#64748b' }">
              {{ space.name.slice(0, 2).toUpperCase() }}
            </span>
            <NuxtLink :to="`/work/spaces/${space.id}`" class="font-display font-semibold text-foam hover:text-beacon">{{ space.name }}</NuxtLink>
            <UIcon v-if="space.private" name="i-lucide-lock" class="size-3.5 text-amber-400" title="Private space" />
            <span v-if="space.task_prefix" class="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-faint ring-1 ring-hull">{{ space.task_prefix }}-…</span>
            <span class="flex-1" />
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-star" title="Favorite" @click="favorite('space', space.id)" />
            <UButton :to="`/work/spaces/${space.id}`" size="xs" variant="ghost" color="neutral" icon="i-lucide-arrow-right" />
          </div>

          <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <template v-for="folder in space.folders" :key="folder.id">
              <div class="rounded-lg bg-surface/50 p-2.5 ring-1 ring-hull">
                <p class="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-faint">
                  <UIcon name="i-lucide-folder" class="size-3.5" /> {{ folder.name }}
                </p>
                <NuxtLink
                  v-for="list in folder.lists" :key="list.id" :to="`/work/lists/${list.id}`"
                  class="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-(--color-muted) transition hover:bg-surface hover:text-foam"
                >
                  <UIcon :name="list.icon || 'i-lucide-list'" class="size-3.5" />
                  <span class="flex-1 truncate">{{ list.name }}</span>
                  <span class="text-xs text-faint">{{ list.open_tasks }}</span>
                </NuxtLink>
                <p v-if="!folder.lists.length" class="px-1.5 text-xs text-faint">Empty folder</p>
              </div>
            </template>
            <NuxtLink
              v-for="list in space.lists" :key="list.id" :to="`/work/lists/${list.id}`"
              class="flex items-center gap-2 rounded-lg bg-surface/50 p-2.5 ring-1 ring-hull transition hover:ring-beacon/40"
            >
              <UIcon :name="list.icon || 'i-lucide-list'" class="size-4 text-beacon" />
              <span class="flex-1 truncate text-sm text-foam">{{ list.name }}</span>
              <span class="text-xs text-faint">{{ list.open_tasks }} open</span>
            </NuxtLink>
          </div>
          <p v-if="!space.folders.length && !space.lists.length" class="text-sm text-faint">
            No lists yet — open the space to add folders and lists.
          </p>
        </div>
      </div>
    </DataState>

    <UModal v-model:open="showCreate" title="New space">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" placeholder="Engineering" class="w-full" /></UFormField>
          <UFormField label="Description"><UTextarea v-model="form.description" :rows="2" class="w-full" /></UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Task ID prefix" hint="e.g. ENG → ENG-1"><UInput v-model="form.task_prefix" placeholder="ENG" class="w-full" /></UFormField>
            <UFormField label="Color"><UInput v-model="form.color" type="color" class="w-full" /></UFormField>
          </div>
          <UCheckbox v-model="form.private" label="Private — only invited members can see this space" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showCreate = false">Cancel</UButton>
          <UButton :loading="creating" :disabled="!form.name" @click="createSpace">Create space</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
