<script setup lang="ts">
// Preferences > General > Appearance. Personal, per-account display settings
// (theme, data density, auto-refresh) - distinct from the admin/portal-wide
// branding under Admin > Appearance.
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

await fetchPreferences()
</script>

<template>
  <div>
    <PageHeader title="Appearance" subtitle="Your personal theme and display settings" icon="i-lucide-paintbrush" />

    <div class="panel p-5 space-y-6 max-w-2xl">
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
  </div>
</template>
