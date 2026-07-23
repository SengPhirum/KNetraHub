<script setup lang="ts">
// Docs hub: visible docs with page counts, create-doc flow.
const { canUseDocs } = useWork()
const toast = useToast()

const { data: docs, status, error, refresh } = useAsyncData('workDocs',
  () => $fetch<any[]>('/api/work/v1/docs'), { server: false, default: () => [] })
const { data: spaces } = useAsyncData('workSpaces',
  () => $fetch<any[]>('/api/work/v1/spaces'), { server: false, default: () => [] })

const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ title: '', space_id: '' })
const spaceItems = computed(() => [
  { label: 'Workspace (everyone)', value: '' },
  ...(spaces.value || []).map((s: any) => ({ label: s.name, value: s.id }))
])

async function createDoc() {
  creating.value = true
  try {
    const result = await $fetch<any>('/api/work/v1/docs', {
      method: 'POST', body: { title: form.title, space_id: form.space_id || undefined }
    })
    showCreate.value = false
    Object.assign(form, { title: '', space_id: '' })
    navigateTo(`/work/docs/${result.id}`)
  } catch (e: any) {
    toast.add({ title: 'Could not create doc', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { creating.value = false }
}
</script>

<template>
  <div>
    <PageHeader title="Docs" subtitle="Team documentation with page history" icon="i-lucide-file-text">
      <template v-if="canUseDocs" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="showCreate = true">New doc</UButton>
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!docs?.length" empty-label="No docs yet." empty-icon="i-lucide-file-text">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <NuxtLink
          v-for="doc in docs" :key="doc.id" :to="`/work/docs/${doc.id}`"
          class="panel block p-4 transition hover:ring-1 hover:ring-beacon/40"
        >
          <div class="mb-2 flex items-center gap-2">
            <UIcon :name="doc.icon || 'i-lucide-file-text'" class="size-5 text-beacon" />
            <p class="truncate font-display font-semibold text-foam">{{ doc.title }}</p>
          </div>
          <div class="flex items-center gap-3 text-xs text-faint">
            <span>{{ doc.page_count }} page(s)</span>
            <span v-if="doc.space_name" class="flex items-center gap-1"><UIcon name="i-lucide-layout-grid" class="size-3" />{{ doc.space_name }}</span>
            <span v-else class="flex items-center gap-1"><UIcon name="i-lucide-globe" class="size-3" />Workspace</span>
            <span class="ml-auto">{{ workShortDate(doc.last_edited_at || doc.updated_at) }}</span>
          </div>
        </NuxtLink>
      </div>
    </DataState>

    <UModal v-model:open="showCreate" title="New doc">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Title" required><UInput v-model="form.title" placeholder="Runbook: production deploys" class="w-full" /></UFormField>
          <UFormField label="Location" hint="A space-scoped doc follows that space's privacy">
            <USelect v-model="form.space_id" :items="spaceItems" value-key="value" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showCreate = false">Cancel</UButton>
          <UButton :loading="creating" :disabled="!form.title" @click="createDoc">Create doc</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
