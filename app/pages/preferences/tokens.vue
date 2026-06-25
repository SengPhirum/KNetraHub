<script setup lang="ts">
// Preferences > Security > API tokens. Personal access tokens for scripts/CI,
// used as `Authorization: Bearer dhub_…`. Create (shown once) and revoke.
const toast = useToast()

interface ApiToken { id: string; name: string; prefix: string; createdAt: string; lastUsed?: string }

const { data: tokens, refresh: refreshTokens } = useFetch<ApiToken[]>('/api/user/tokens', { default: () => [] })
const tokenSortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Created', value: 'createdAt' },
  { label: 'Last used', value: 'lastUsed' },
  { label: 'Prefix', value: 'prefix' }
]
const {
  items: filteredTokens,
  search: tokenSearch,
  sortBy: tokenSortBy,
  sortDir: tokenSortDir,
  sortOptions: tokenSortOptionsState
} = useListControls('preferences:tokens', tokens, {
  sortOptions: tokenSortOptions,
  defaultSortBy: 'createdAt',
  defaultSortDir: 'desc'
})
const newTokenName = ref('')
const creatingToken = ref(false)
const newlyCreated = ref<{ token: string; name: string } | null>(null)

async function createToken() {
  if (!newTokenName.value.trim()) return
  creatingToken.value = true
  try {
    const result = await $fetch<ApiToken & { token: string }>('/api/user/tokens', {
      method: 'POST',
      body: { name: newTokenName.value.trim() }
    })
    newlyCreated.value = { token: result.token, name: result.name }
    newTokenName.value = ''
    await refreshTokens()
  } catch (e: any) {
    toast.add({ title: 'Failed to create token', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    creatingToken.value = false
  }
}

const revokingId = ref<string | null>(null)
async function revokeToken(id: string) {
  revokingId.value = id
  try {
    await $fetch(`/api/user/tokens/${id}`, { method: 'DELETE' })
    await refreshTokens()
    toast.add({ title: 'Token revoked', color: 'neutral', icon: 'i-lucide-trash-2' })
  } catch (e: any) {
    toast.add({ title: 'Failed to revoke token', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    revokingId.value = null
  }
}

function copyToken(token: string) {
  navigator.clipboard.writeText(token)
  toast.add({ title: 'Copied to clipboard', color: 'primary', icon: 'i-lucide-copy-check' })
}

function dismissNewToken() { newlyCreated.value = null }
</script>

<template>
  <div>
    <PageHeader title="API tokens" subtitle="Personal access tokens for scripts, CI, and the API" icon="i-lucide-key-round" />

    <!-- New token banner -->
    <div v-if="newlyCreated" class="mb-4 max-w-2xl rounded-lg border border-success-500/30 bg-success-500/10 p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-foam mb-1">
            <UIcon name="i-lucide-key-round" class="size-4 text-success inline mr-1" />
            Token created — copy it now, it won't be shown again
          </p>
          <div class="flex items-center gap-2 mt-2">
            <code class="flex-1 truncate font-mono text-xs bg-surface-2 rounded px-2 py-1.5 text-beacon border border-hull select-all">{{ newlyCreated.token }}</code>
            <UButton icon="i-lucide-copy" size="sm" color="primary" variant="soft" @click="copyToken(newlyCreated!.token)" />
          </div>
        </div>
        <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" @click="dismissNewToken" />
      </div>
    </div>

    <div class="panel p-5 space-y-5 max-w-2xl">
      <!-- Create form -->
      <div>
        <div class="flex items-center gap-2 mb-1">
          <UIcon name="i-lucide-plus-circle" class="size-4 text-beacon" />
          <h3 class="font-display text-sm font-semibold text-foam">New token</h3>
        </div>
        <p class="text-sm text-(--color-muted) mb-3">
          Tokens are used as <code class="font-mono text-beacon text-xs">Authorization: Bearer dhub_…</code> headers.
          Use them in scripts, CI pipelines, or the
          <NuxtLink to="/api/swagger" target="_blank" class="text-beacon hover:underline">API reference</NuxtLink>.
        </p>
        <div class="flex gap-2">
          <UInput v-model="newTokenName" placeholder="Token name (e.g. CI pipeline)" class="flex-1" :disabled="creatingToken" @keydown.enter="createToken" />
          <UButton color="primary" icon="i-lucide-plus" label="Generate" :loading="creatingToken" :disabled="!newTokenName.trim()" @click="createToken" />
        </div>
      </div>

      <!-- Token list -->
      <div v-if="tokens?.length" class="border-t border-hull pt-5 space-y-2">
        <ListControls
          v-model:search="tokenSearch"
          v-model:sort-by="tokenSortBy"
          v-model:sort-dir="tokenSortDir"
          :sort-options="tokenSortOptionsState"
          placeholder="Search tokens"
        />
        <p v-if="!filteredTokens.length" class="text-sm text-faint">No matching tokens.</p>
        <div
          v-for="tok in filteredTokens" :key="tok.id"
          class="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2.5"
        >
          <UIcon name="i-lucide-key-round" class="size-4 shrink-0 text-faint" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-foam truncate">{{ tok.name }}</p>
            <p class="text-xs text-faint font-mono">
              dhub_{{ tok.prefix }}…
              <span class="ml-2 not-font-mono">created {{ new Date(tok.createdAt).toLocaleDateString() }}</span>
              <span v-if="tok.lastUsed" class="ml-2">· last used {{ new Date(tok.lastUsed).toLocaleDateString() }}</span>
            </p>
          </div>
          <UButton
            icon="i-lucide-trash-2"
            size="sm"
            color="error"
            variant="ghost"
            :loading="revokingId === tok.id"
            @click="revokeToken(tok.id)"
          />
        </div>
      </div>
      <p v-else class="text-sm text-faint border-t border-hull pt-4">No tokens yet.</p>
    </div>
  </div>
</template>
