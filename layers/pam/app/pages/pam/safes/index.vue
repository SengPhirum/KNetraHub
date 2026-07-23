<script setup lang="ts">
// Safes — secured containers for accounts/credentials. List + create wizard.
const { hasPam, canManageSafes } = usePam()
const toast = useToast()

const { data, status, error, refresh } = useAsyncData('pamSafes',
  () => $fetch<any[]>('/api/pam/v1/safes'), { server: false, default: () => [] })

const showCreate = ref(false)
const creating = ref(false)
const form = reactive({ name: '', slug: '', description: '', department: '', environment: 'production', criticality: 'medium', require_dual_control: false })

async function createSafe() {
  creating.value = true
  try {
    await $fetch('/api/pam/v1/safes', { method: 'POST', body: { ...form } })
    toast.add({ title: 'Safe created', color: 'success' })
    showCreate.value = false
    Object.assign(form, { name: '', slug: '', description: '', department: '', environment: 'production', criticality: 'medium', require_dual_control: false })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not create safe', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { creating.value = false }
}

const critBadge = CRITICALITY_BADGE
</script>

<template>
  <div>
    <PageHeader title="Safes" subtitle="Secured containers for privileged accounts and secrets" icon="i-lucide-vault">
      <template v-if="canManageSafes" #actions>
        <UButton icon="i-lucide-plus" size="sm" @click="showCreate = true">New safe</UButton>
      </template>
    </PageHeader>

    <DataState :status="status" :error="error" :empty="!data?.length" empty-label="No safes yet.">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <NuxtLink v-for="s in data" :key="s.id" :to="`/pam/safes/${s.id}`" class="panel block p-4 transition hover:ring-1 hover:ring-beacon/40">
          <div class="mb-2 flex items-start justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate font-display font-semibold text-foam">{{ s.name }}</p>
              <p class="truncate font-mono text-xs text-faint">{{ s.slug }}</p>
            </div>
            <span class="shrink-0 rounded px-1.5 py-0.5 text-xs" :class="critBadge[s.criticality]">{{ s.criticality }}</span>
          </div>
          <p v-if="s.description" class="mb-3 line-clamp-2 text-sm text-(--color-muted)">{{ s.description }}</p>
          <div class="flex items-center gap-4 text-xs text-faint">
            <span class="flex items-center gap-1"><UIcon name="i-lucide-key-round" class="size-3.5" /> {{ s.account_count }} accounts</span>
            <span class="flex items-center gap-1"><UIcon name="i-lucide-users" class="size-3.5" /> {{ s.member_count }} members</span>
            <span v-if="s.require_dual_control" class="flex items-center gap-1 text-amber-400"><UIcon name="i-lucide-shield-alert" class="size-3.5" /> dual control</span>
          </div>
        </NuxtLink>
      </div>
    </DataState>

    <UModal v-model:open="showCreate" title="New safe">
      <template #body>
        <div class="space-y-3">
          <UFormField label="Name" required><UInput v-model="form.name" placeholder="Production Linux" /></UFormField>
          <UFormField label="Slug" hint="lowercase, unique"><UInput v-model="form.slug" placeholder="prod-linux" /></UFormField>
          <UFormField label="Description"><UTextarea v-model="form.description" :rows="2" /></UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Department"><UInput v-model="form.department" /></UFormField>
            <UFormField label="Environment">
              <USelect v-model="form.environment" :items="['production','staging','development','testing']" />
            </UFormField>
          </div>
          <UFormField label="Criticality">
            <USelect v-model="form.criticality" :items="['low','medium','high','critical']" />
          </UFormField>
          <UCheckbox v-model="form.require_dual_control" label="Require dual authorization for destructive actions" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="showCreate = false">Cancel</UButton>
          <UButton :loading="creating" :disabled="!form.name" @click="createSafe">Create safe</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
