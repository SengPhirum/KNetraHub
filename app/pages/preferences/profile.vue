<script setup lang="ts">
// Preferences > Account > Profile. Self-service identity. Display name is
// editable for local accounts (PATCH /api/user/profile); for LDAP/OIDC accounts
// it's managed by the directory/provider and shown read-only (a local edit would
// be overwritten on next sign-in).
const { user, fetchMe } = useAuth()
const toast = useToast()

const isLocal = computed(() => user.value?.source === 'local')

const form = reactive({ displayName: '' })
watch(user, (u) => { form.displayName = u?.displayName || '' }, { immediate: true })

const saving = ref(false)
async function saveProfile() {
  if (!form.displayName.trim()) { toast.add({ title: 'Display name is required', color: 'warning' }); return }
  saving.value = true
  try {
    await $fetch('/api/user/profile', { method: 'PATCH', body: { displayName: form.displayName.trim() } })
    await fetchMe()
    toast.add({ title: 'Profile updated', color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Update failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Profile" subtitle="Your account identity" icon="i-lucide-user-round" />

    <div class="panel p-5 space-y-5 max-w-2xl">
      <div class="flex items-center gap-4">
        <span class="flex size-12 items-center justify-center rounded-full bg-surface-2 text-lg font-semibold text-foam ring-2 ring-hull">
          {{ (user?.displayName || user?.username || '?').charAt(0).toUpperCase() }}
        </span>
        <div class="min-w-0">
          <p class="font-medium text-foam">{{ user?.displayName || user?.username || '—' }}</p>
          <p class="font-mono text-xs text-faint">{{ user?.username || '—' }}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div class="rounded-lg bg-surface-2 px-3 py-2">
          <p class="text-xs text-faint mb-0.5">Username</p>
          <p class="font-medium text-foam font-mono">{{ user?.username || '—' }}</p>
        </div>
        <div class="rounded-lg bg-surface-2 px-3 py-2">
          <p class="text-xs text-faint mb-0.5">Global role</p>
          <p class="font-medium capitalize text-foam">{{ user?.role || '—' }}</p>
        </div>
        <div class="rounded-lg bg-surface-2 px-3 py-2">
          <p class="text-xs text-faint mb-0.5">Auth source</p>
          <p class="font-medium uppercase text-foam">{{ user?.source || '—' }}</p>
        </div>
      </div>

      <div class="border-t border-hull pt-5">
        <div class="flex items-center gap-2 mb-3">
          <UIcon name="i-lucide-id-card" class="size-4 text-beacon" />
          <h3 class="font-display text-sm font-semibold text-foam">Display name</h3>
        </div>
        <div v-if="isLocal" class="flex flex-col gap-3 sm:flex-row sm:items-end max-w-md">
          <UFormField label="Display name" class="flex-1">
            <UInput v-model="form.displayName" class="w-full" :disabled="saving" />
          </UFormField>
          <UButton color="primary" label="Save" icon="i-lucide-save" :loading="saving" @click="saveProfile" />
        </div>
        <p v-else class="text-xs text-faint">
          {{ user?.source === 'ldap' ? 'Your display name is managed by your LDAP directory.' : 'Your display name is managed by your identity provider.' }}
        </p>
      </div>
    </div>
  </div>
</template>
