<script setup lang="ts">
const { user, can } = useAuth()
const { prefs, fetchPreferences, updatePreferences } = usePreferences()
const toast = useToast()

const localPrefs = reactive({ ...prefs.value })
watch(prefs, (v) => Object.assign(localPrefs, v), { immediate: true })

const savingPrefs = ref(false)
async function savePreferences() {
  savingPrefs.value = true
  try {
    await updatePreferences({ ...localPrefs })
    toast.add({ title: 'Preferences saved', color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingPrefs.value = false
  }
}

const themeOptions = [
  { value: 'system', label: 'System', icon: 'i-lucide-monitor' },
  { value: 'dark',   label: 'Dark',   icon: 'i-lucide-moon' },
  { value: 'light',  label: 'Light',  icon: 'i-lucide-sun' }
]
const densityOptions = [
  { value: 'compact',     label: 'Compact' },
  { value: 'default',     label: 'Default' },
  { value: 'comfortable', label: 'Comfortable' }
]
const refreshOptions = [
  { value: 0,  label: 'Manual only' },
  { value: 15, label: 'Every 15 s' },
  { value: 30, label: 'Every 30 s' },
  { value: 60, label: 'Every 60 s' }
]

const pwd = reactive({ a: '', b: '' })
const savingPwd = ref(false)
const canChangePassword = computed(() => user.value?.source === 'local')
async function changePassword() {
  if (!pwd.a || pwd.a !== pwd.b) { toast.add({ title: 'Passwords do not match', color: 'warning' }); return }
  savingPwd.value = true
  try {
    await $fetch(`/api/users/${user.value!.id}`, { method: 'PATCH', body: { password: pwd.a } })
    toast.add({ title: 'Password changed', color: 'primary', icon: 'i-lucide-key-round' })
    pwd.a = ''; pwd.b = ''
  } catch (e: any) {
    toast.add({ title: 'Change failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingPwd.value = false
  }
}

await fetchPreferences()
</script>

<template>
  <div>
    <PageHeader title="Preferences" subtitle="Appearance, display settings, and your account" icon="i-lucide-sliders-horizontal" />

    <div class="space-y-6 max-w-2xl">

      <!-- ── Appearance ──────────────────────────────────────────────────────── -->
      <section>
        <h2 class="mb-3 text-xs font-semibold uppercase tracking-widest text-faint">Appearance</h2>

        <div class="panel p-5 space-y-6">
          <!-- Theme -->
          <div>
            <div class="flex items-center gap-2 mb-1">
              <UIcon name="i-lucide-palette" class="size-4 text-beacon" />
              <h3 class="font-display text-sm font-semibold text-foam">Color theme</h3>
            </div>
            <p class="text-sm text-(--color-muted) mb-3">Stored per-account and applies across all sessions.</p>
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="opt in themeOptions" :key="opt.value"
                class="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all"
                :class="localPrefs.theme === opt.value
                  ? 'border-beacon bg-beacon/10 text-beacon'
                  : 'border-hull text-(--color-muted) hover:border-hull-soft hover:text-foam'"
                @click="localPrefs.theme = opt.value as any"
              >
                <UIcon :name="opt.icon" class="size-4" />
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Density -->
          <div class="border-t border-hull pt-5">
            <div class="flex items-center gap-2 mb-1">
              <UIcon name="i-lucide-layout-list" class="size-4 text-beacon" />
              <h3 class="font-display text-sm font-semibold text-foam">Data density</h3>
            </div>
            <p class="text-sm text-(--color-muted) mb-3">Controls row spacing in list views.</p>
            <div class="flex gap-2">
              <button
                v-for="opt in densityOptions" :key="opt.value"
                class="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all"
                :class="localPrefs.density === opt.value
                  ? 'border-beacon bg-beacon/10 text-beacon'
                  : 'border-hull text-(--color-muted) hover:text-foam'"
                @click="localPrefs.density = opt.value as any"
              >{{ opt.label }}</button>
            </div>
          </div>

          <!-- Refresh interval -->
          <div class="border-t border-hull pt-5">
            <div class="flex items-center gap-2 mb-1">
              <UIcon name="i-lucide-timer" class="size-4 text-beacon" />
              <h3 class="font-display text-sm font-semibold text-foam">Auto-refresh interval</h3>
            </div>
            <p class="text-sm text-(--color-muted) mb-3">Fallback polling rate when the live SSE stream is unavailable.</p>
            <div class="flex gap-2 flex-wrap">
              <button
                v-for="opt in refreshOptions" :key="opt.value"
                class="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all"
                :class="localPrefs.refreshInterval === opt.value
                  ? 'border-beacon bg-beacon/10 text-beacon'
                  : 'border-hull text-(--color-muted) hover:text-foam'"
                @click="localPrefs.refreshInterval = opt.value"
              >{{ opt.label }}</button>
            </div>
          </div>

          <div class="flex justify-end border-t border-hull pt-5">
            <UButton color="primary" label="Save preferences" icon="i-lucide-check" :loading="savingPrefs" @click="savePreferences" />
          </div>
        </div>
      </section>

      <!-- ── Account ─────────────────────────────────────────────────────────── -->
      <section>
        <h2 class="mb-3 text-xs font-semibold uppercase tracking-widest text-faint">Account</h2>

        <!-- Profile card -->
        <div class="panel p-5 space-y-5">
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
              <p class="text-xs text-faint mb-0.5">Role</p>
              <p class="font-medium capitalize text-foam">{{ user?.role || '—' }}</p>
            </div>
            <div class="rounded-lg bg-surface-2 px-3 py-2">
              <p class="text-xs text-faint mb-0.5">Auth source</p>
              <p class="font-medium uppercase text-foam">{{ user?.source || '—' }}</p>
            </div>
          </div>

          <!-- Password -->
          <div class="border-t border-hull pt-5">
            <div class="flex items-center gap-2 mb-3">
              <UIcon name="i-lucide-key-round" class="size-4 text-beacon" />
              <h3 class="font-display text-sm font-semibold text-foam">Password</h3>
            </div>
            <div v-if="canChangePassword" class="grid gap-3 sm:grid-cols-2 max-w-md">
              <UFormField label="New password">
                <UInput v-model="pwd.a" type="password" class="w-full" :disabled="savingPwd" />
              </UFormField>
              <UFormField label="Confirm">
                <UInput v-model="pwd.b" type="password" class="w-full" :disabled="savingPwd" />
              </UFormField>
              <div class="sm:col-span-2">
                <UButton color="primary" label="Change password" icon="i-lucide-key-round" :loading="savingPwd" @click="changePassword" />
              </div>
            </div>
            <p v-else class="text-xs text-faint">
              {{ user?.source === 'ldap' ? 'Your password is managed by your LDAP directory.' : 'Contact an administrator to change your password.' }}
            </p>
          </div>
        </div>
      </section>

    </div>
  </div>
</template>
