<script setup lang="ts">
// Dock app administrator settings. These belong to the Docker app specifically,
// not the portal: GitLab stack versioning (Integrations). Swarm alerting now
// lives in its own "Alerts" sidebar section (/docker/alerts) — rules and
// delivery channels — mirroring the Monitoring module's Alerts menu.
// Gated by the per-app docker admin tier - the same boundary the
// /api/gitlab/* routes already enforce server-side
// (server/middleware/appAccess.ts).
definePageMeta({
  middleware: [
    function () {
      const { hasPermission } = useAuth()
      if (!hasPermission('docker.manage')) return navigateTo('/docker')
    }
  ]
})

interface GitlabStatus {
  configured: boolean
  connected: boolean
  error?: string
  url: string
  projectId: string
  branch: string
  stacksPath: string
  enabled: boolean
  hasToken: boolean
  overridden: boolean
}

const toast = useToast()

function sourceLabel(overridden?: boolean) {
  return overridden ? 'DB override' : 'Env default'
}
function sourceColor(overridden?: boolean) {
  return overridden ? 'primary' : 'neutral'
}

// ─── GitLab ───────────────────────────────────────────────────────────────────
const { data: gl, refresh: refreshGitlab } = useFetch<GitlabStatus>('/api/gitlab/status', { lazy: true })
const gitlabForm = reactive({ enabled: false, url: '', token: '', projectId: '', branch: '', stacksPath: '' })
const savingGitlab = ref(false)
const resettingGitlab = ref(false)
const testingGitlab = ref(false)

watch(gl, (value) => {
  if (!value) return
  Object.assign(gitlabForm, {
    enabled: value.enabled,
    url: value.url,
    token: '',
    projectId: value.projectId,
    branch: value.branch,
    stacksPath: value.stacksPath
  })
}, { immediate: true })

function gitlabStatusLabel() {
  if (!gl.value) return 'Loading...'
  if (!gl.value.configured) return 'Not configured'
  if (gl.value.connected) return 'Connected'
  return `Unreachable${gl.value.error ? ': ' + gl.value.error : ''}`
}
function gitlabDotClass() {
  if (!gl.value?.configured) return 'dot-idle'
  return gl.value.connected ? 'dot-running' : 'dot-down'
}
function gitlabStatusClass() {
  if (!gl.value?.configured) return 'text-(--color-muted)'
  return gl.value.connected ? 'status-running' : 'status-down'
}

async function saveGitlab() {
  savingGitlab.value = true
  try {
    await $fetch('/api/gitlab/settings', { method: 'PUT', body: { ...gitlabForm } })
    toast.add({ title: 'GitLab settings saved', color: 'primary', icon: 'i-lucide-check' })
    await refreshGitlab()
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingGitlab.value = false
  }
}

async function testGitlabConnection() {
  testingGitlab.value = true
  try {
    await refreshGitlab()
    if (gl.value?.connected) toast.add({ title: 'GitLab connection OK', color: 'primary', icon: 'i-lucide-check' })
    else toast.add({ title: 'GitLab connection failed', description: gl.value?.error, color: 'error' })
  } finally {
    testingGitlab.value = false
  }
}

async function resetGitlab() {
  if (!confirm('Reset GitLab settings to environment defaults?')) return
  resettingGitlab.value = true
  try {
    await $fetch('/api/gitlab/settings', { method: 'DELETE' })
    toast.add({ title: 'GitLab now follows environment defaults', color: 'primary', icon: 'i-lucide-rotate-ccw' })
    await refreshGitlab()
  } catch (e: any) {
    toast.add({ title: 'Reset failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    resettingGitlab.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Dock settings" subtitle="GitLab stack versioning for the Docker app" icon="i-lucide-settings">
      <template #actions>
        <div class="flex gap-2">
          <UButton icon="i-lucide-bell-ring" color="neutral" variant="soft" label="Alerts" to="/docker/alerts" />
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="soft" label="Back to Dock" to="/docker" />
        </div>
      </template>
    </PageHeader>

    <div class="grid gap-4 max-w-5xl xl:grid-cols-2">
      <section class="panel p-5 space-y-5">
        <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2">
              <UIcon name="i-lucide-git-branch" class="size-4 text-beacon" />
              GitLab
            </h3>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span class="dot" :class="gitlabDotClass()" />
              <span :class="gitlabStatusClass()">{{ gitlabStatusLabel() }}</span>
              <UBadge :color="sourceColor(gl?.overridden)" variant="subtle" :label="sourceLabel(gl?.overridden)" />
            </div>
          </div>
          <USwitch v-model="gitlabForm.enabled" color="primary" class="self-start" />
        </header>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="GitLab URL">
            <UInput v-model="gitlabForm.url" class="w-full font-mono" placeholder="https://gitlab.com" />
          </UFormField>
          <UFormField label="Project ID">
            <UInput v-model="gitlabForm.projectId" class="w-full font-mono" />
          </UFormField>
          <UFormField label="Branch">
            <UInput v-model="gitlabForm.branch" class="w-full font-mono" placeholder="main" />
          </UFormField>
          <UFormField label="Stacks path">
            <UInput v-model="gitlabForm.stacksPath" class="w-full font-mono" placeholder="stacks" />
          </UFormField>
          <UFormField label="Access token" class="sm:col-span-2">
            <UInput
              v-model="gitlabForm.token"
              type="password"
              class="w-full font-mono"
              :placeholder="gl?.hasToken ? 'Configured - leave blank to keep' : 'Not set'"
            />
          </UFormField>
        </div>

        <footer class="flex flex-col gap-2 border-t border-hull pt-4 sm:flex-row sm:justify-end">
          <UButton color="neutral" variant="ghost" label="Test connection" icon="i-lucide-plug-zap" :loading="testingGitlab" @click="testGitlabConnection" />
          <UButton color="neutral" variant="ghost" label="Use env defaults" icon="i-lucide-rotate-ccw" :disabled="!gl?.overridden" :loading="resettingGitlab" @click="resetGitlab" />
          <UButton color="primary" label="Save GitLab" icon="i-lucide-save" :loading="savingGitlab" @click="saveGitlab" />
        </footer>
      </section>
    </div>
  </div>
</template>
