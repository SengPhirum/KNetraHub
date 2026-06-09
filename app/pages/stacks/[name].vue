<script setup lang="ts">
const route = useRoute()
const name = route.params.name as string
const { can } = useAuth()
const { relative, short } = useFormat()
const toast = useToast()

const { data, status, error, refresh } = await useFetch(`/api/stacks/${name}`, { lazy: true })

const tab = ref<'services' | 'compose' | 'history'>('services')

// compose editor
const draft = ref('')
const editing = ref(false)
const saving = ref(false)
watch(data, (d) => { if (d?.compose != null && !editing.value) draft.value = d.compose }, { immediate: true })

async function redeploy() {
  if (!draft.value) { toast.add({ title: 'No compose content', color: 'warning' }); return }
  saving.value = true
  try {
    const res: any = await $fetch('/api/stacks', {
      method: 'POST',
      body: { name, compose: draft.value, message: `Update ${name} via DockHub` }
    })
    toast.add({ title: `Redeployed ${name}`, description: `${res.created?.length || 0} created, ${res.updated?.length || 0} updated`, color: 'primary', icon: 'i-lucide-rocket' })
    if (res.warnings?.length) toast.add({ title: 'Warnings', description: res.warnings.slice(0, 3).join('; '), color: 'warning' })
    editing.value = false
    setTimeout(refresh, 700)
  } catch (e: any) {
    toast.add({ title: 'Deploy failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { saving.value = false }
}

// history / rollback
const diffOpen = ref(false)
const diffSha = ref('')
const diffContent = ref('')
const diffLoading = ref(false)
async function viewCommit(sha: string) {
  diffSha.value = sha
  diffOpen.value = true
  diffLoading.value = true
  diffContent.value = ''
  try {
    const res: any = await $fetch(`/api/gitlab/${name}/commit`, { query: { sha } })
    diffContent.value = res.content || ''
  } catch (e: any) {
    diffContent.value = `# Failed to load: ${e?.data?.statusMessage || e?.message}`
  } finally { diffLoading.value = false }
}
async function rollback(sha: string) {
  if (!confirm(`Roll back "${name}" to commit ${sha.slice(0, 8)}? This commits and redeploys the older version.`)) return
  try {
    await $fetch(`/api/stacks/${name}/rollback`, { method: 'POST', body: { sha } })
    toast.add({ title: `Rolled back ${name}`, description: `to ${sha.slice(0, 8)}`, color: 'primary', icon: 'i-lucide-history' })
    diffOpen.value = false
    setTimeout(refresh, 700)
  } catch (e: any) {
    toast.add({ title: 'Rollback failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}

async function remove() {
  if (!confirm(`Remove stack "${name}"? This stops and deletes all its services.`)) return
  try {
    await $fetch(`/api/stacks/${name}`, { method: 'DELETE' })
    toast.add({ title: `Removed ${name}`, color: 'primary' })
    navigateTo('/stacks')
  } catch (e: any) {
    toast.add({ title: 'Remove failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}

const tabs = computed(() => {
  const t = [{ key: 'services', label: 'Services', icon: 'i-lucide-boxes' }]
  if (data.value?.compose != null) t.push({ key: 'compose', label: 'Compose', icon: 'i-lucide-file-code' })
  if (data.value?.history?.length) t.push({ key: 'history', label: 'History', icon: 'i-lucide-history' })
  return t
})
</script>

<template>
  <div>
    <PageHeader :title="name" subtitle="Stack" icon="i-lucide-layers">
      <template #actions>
        <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/stacks" label="Back" />
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" @click="refresh()" />
        <UButton v-if="can('operator')" icon="i-lucide-trash-2" color="error" variant="soft" label="Remove" @click="remove" />
      </template>
    </PageHeader>

    <DataState :status="status" :error="error">
      <div class="flex flex-wrap gap-1 mb-5 border-b border-[var(--color-hull)]">
        <button v-for="t in tabs" :key="t.key" @click="tab = t.key as any"
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition"
          :class="tab === t.key ? 'border-[var(--color-beacon)] text-[var(--color-foam)]' : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-foam)]'">
          <UIcon :name="t.icon" class="size-4" /> {{ t.label }}
        </button>
      </div>

      <!-- services -->
      <div v-if="tab === 'services'" class="space-y-2">
        <div v-if="!data?.services?.length" class="panel p-10 text-center text-sm text-[var(--color-muted)]">
          No running services for this stack.
        </div>
        <NuxtLink v-for="s in data?.services" :key="s.id" :to="`/services/${s.id}`"
          class="panel-flush p-3.5 flex items-center justify-between gap-3 hover:ring-[var(--color-beacon)]/30 transition group">
          <div class="flex items-center gap-2 min-w-0">
            <span class="dot" :class="s.running >= (s.replicas ?? 1) && (s.running > 0 || s.replicas === 0) ? 'dot-running' : s.running > 0 ? 'dot-pending' : 'dot-down'" />
            <div class="min-w-0">
              <p class="truncate font-medium text-[var(--color-foam)] group-hover:text-[var(--color-beacon)]">{{ s.name }}</p>
              <p class="truncate font-mono text-xs text-[var(--color-faint)]">{{ s.image }}</p>
            </div>
          </div>
          <p class="font-mono text-sm shrink-0">
            <span :class="s.running >= (s.replicas ?? 1) ? 'text-emerald-300' : 'text-amber-300'">{{ s.running }}</span>
            <span class="text-[var(--color-faint)]">/{{ s.replicas === null ? 'global' : s.replicas }}</span>
          </p>
        </NuxtLink>
      </div>

      <!-- compose -->
      <div v-else-if="tab === 'compose'" class="panel p-0 overflow-hidden">
        <div class="flex items-center justify-between gap-2 border-b border-[var(--color-hull)] px-4 py-2.5">
          <span class="flex items-center gap-2 font-mono text-xs text-[var(--color-muted)]">
            <UIcon name="i-lucide-file-code" class="size-4" /> {{ name }}.yml
          </span>
          <div v-if="can('operator')" class="flex gap-2">
            <template v-if="editing">
              <UButton size="xs" color="neutral" variant="ghost" label="Cancel" :disabled="saving" @click="editing = false; draft = data?.compose || ''" />
              <UButton size="xs" color="primary" icon="i-lucide-rocket" label="Save & redeploy" :loading="saving" @click="redeploy" />
            </template>
            <UButton v-else size="xs" color="neutral" variant="soft" icon="i-lucide-pencil" label="Edit" @click="editing = true" />
          </div>
        </div>
        <UTextarea v-if="editing" v-model="draft" :rows="22" variant="none"
          class="w-full font-mono text-xs" spellcheck="false" :disabled="saving" />
        <pre v-else class="logstream max-h-[60vh] overflow-auto px-4 py-3 text-xs">{{ draft || '# No compose file stored in GitLab for this stack.' }}</pre>
      </div>

      <!-- history -->
      <div v-else-if="tab === 'history'" class="space-y-0">
        <div v-for="(c, i) in data?.history" :key="c.id" class="relative flex gap-3 pl-1">
          <div class="flex flex-col items-center">
            <span class="mt-1.5 size-2.5 rounded-full bg-[var(--color-beacon)] ring-4 ring-[var(--color-beacon)]/10" />
            <span v-if="i < (data?.history?.length || 0) - 1" class="w-px flex-1 bg-[var(--color-hull)]" />
          </div>
          <div class="panel-flush flex-1 mb-3 p-3.5">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-[var(--color-foam)]">{{ c.title || c.message }}</p>
                <p class="mt-0.5 text-xs text-[var(--color-faint)]">
                  {{ c.author_name }} · {{ relative(c.created_at || c.committed_date) }} ·
                  <span class="font-mono">{{ short(c.id, 8) }}</span>
                  <span v-if="i === 0" class="ml-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">current</span>
                </p>
              </div>
              <div class="flex gap-1.5 shrink-0">
                <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-eye" label="View" @click="viewCommit(c.id)" />
                <UButton v-if="can('operator') && i > 0" size="xs" color="warning" variant="soft" icon="i-lucide-history" label="Rollback" @click="rollback(c.id)" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </DataState>

    <!-- commit view modal -->
    <UModal v-model:open="diffOpen" :title="`Compose at ${short(diffSha, 8)}`" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div v-if="diffLoading" class="flex items-center justify-center py-12 text-[var(--color-muted)]">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin mr-2" /> Loading…
        </div>
        <pre v-else class="logstream max-h-[55vh] overflow-auto rounded-lg p-3 text-xs">{{ diffContent }}</pre>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" label="Close" @click="diffOpen = false" />
          <UButton v-if="can('operator')" color="warning" icon="i-lucide-history" label="Roll back to this" @click="rollback(diffSha)" />
        </div>
      </template>
    </UModal>
  </div>
</template>
