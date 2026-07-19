<script setup lang="ts">
// Admin > General > Appearance. Rebrand the running app (name, primary color,
// logos, favicon, PWA icon) without a rebuild. Was a tab in the old /settings.
definePageMeta({ middleware: 'admin' })

const toast = useToast()
const { appearance, overridden: appearanceOverridden, previewAppearance, saveAppearance, resetAppearance, fetchAppearance } = useAppearance()

// ── Environment mode ──────────────────────────────────────────────────────
// Fixed via NUXT_ENV_MODE (docker-compose) > admin choice here > auto-detected
// from the serving domain. Non-production modes tag every logo/icon with a
// corner badge (Dev / Test / STG).
const { envMode, saveEnvMode } = useEnvMode()
const savingEnvMode = ref(false)
// USelect (Reka UI) forbids an empty-string item value, so the "auto-detect"
// choice uses an 'auto' sentinel here and is mapped back to '' (clear the
// stored override) when saved.
const envModeChoice = ref<string>('auto')
watch(() => envMode.value.adminMode, (v) => { envModeChoice.value = v || 'auto' }, { immediate: true })

const ENV_MODE_ITEMS = [
  { value: 'auto', label: 'Auto-detect from domain' },
  { value: 'production', label: 'Production (no badge)' },
  { value: 'staging', label: 'Staging - "STG" badge' },
  { value: 'development', label: 'Development - "Dev" badge' },
  { value: 'testing', label: 'Testing - "Test" badge' }
]

const envSourceText = computed(() => {
  if (envMode.value.locked) return 'Fixed by NUXT_ENV_MODE in the deployment configuration (docker-compose) - remove that variable and redeploy to manage it here.'
  if (envMode.value.source === 'admin') return 'Set by an administrator on this page.'
  return 'Auto-detected from the serving domain (staging/stg/sta → Staging, development/dev → Development, testing/test → Testing, anything else → Production).'
})

const BADGE_PRESET_COLORS = ['#DC2626', '#EA580C', '#D97706', '#CA8A04', '#16A34A', '#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#0F172A']

async function saveEnvModeSetting() {
  savingEnvMode.value = true
  try {
    // Badge color is stored with appearance (it's branding); persist it
    // alongside the mode so this one Save button covers the whole section.
    await saveAppearance({ envBadgeColor: appearance.value.envBadgeColor })
    if (!envMode.value.locked) await saveEnvMode(envModeChoice.value === 'auto' ? '' : (envModeChoice.value as any))
    toast.add({ title: 'Environment settings saved', description: 'Logo and icon badges update for every user.', color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingEnvMode.value = false
  }
}

function sourceLabel(overridden?: boolean) {
  return overridden ? 'DB override' : 'Env default'
}
function sourceColor(overridden?: boolean) {
  return overridden ? 'primary' : 'neutral'
}

const PRESET_COLORS = ['#2496ED', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#D97706', '#16A34A', '#0D9488', '#0284C7', '#475569']
const MAX_LOGO_BYTES = 1.5 * 1024 * 1024

const savingAppearance = ref(false)
const resettingAppearance = ref(false)
const logoHorizontalInput = ref<HTMLInputElement | null>(null)
const logoIconInput = ref<HTMLInputElement | null>(null)
const faviconInput = ref<HTMLInputElement | null>(null)
const pwaIconInput = ref<HTMLInputElement | null>(null)

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function onLogoFileChange(e: Event, field: 'logoHorizontalUrl' | 'logoIconUrl' | 'faviconUrl' | 'pwaIconUrl') {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.add({ title: 'Invalid file', description: 'Please choose an image file.', color: 'error' })
  } else if (file.size > MAX_LOGO_BYTES) {
    toast.add({ title: 'Image too large', description: 'Please choose an image under 1.5 MB.', color: 'error' })
  } else {
    previewAppearance({ [field]: await readFileAsDataUrl(file) })
  }
  input.value = ''
}

function clearLogo(field: 'logoHorizontalUrl' | 'logoIconUrl' | 'faviconUrl' | 'pwaIconUrl') {
  previewAppearance({ [field]: '' })
}

async function saveAppearanceSettings() {
  savingAppearance.value = true
  try {
    await saveAppearance({ ...appearance.value })
    toast.add({ title: 'Appearance saved', description: 'Applied for every user.', color: 'primary', icon: 'i-lucide-check' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    savingAppearance.value = false
  }
}

async function revertAppearancePreview() {
  await fetchAppearance()
}

async function resetAppearanceToDefaults() {
  if (!confirm('Reset appearance to the built-in KNetraHub defaults?')) return
  resettingAppearance.value = true
  try {
    await resetAppearance()
    toast.add({ title: 'Appearance reset to defaults', color: 'primary', icon: 'i-lucide-rotate-ccw' })
  } catch (e: any) {
    toast.add({ title: 'Reset failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    resettingAppearance.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Appearance" subtitle="Rebrand the running app - name, color, logos, and icons" icon="i-lucide-paintbrush" />

    <div class="grid gap-4 xl:grid-cols-2">
      <section class="panel p-5 space-y-5">
        <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2">
              <UIcon name="i-lucide-paintbrush" class="size-4 text-beacon" />
              Branding
            </h3>
            <p class="mt-1 text-xs text-(--color-muted)">
              Changes preview live across the whole app as you edit. Nothing is shared with other users until you save.
            </p>
          </div>
          <UBadge :color="sourceColor(appearanceOverridden)" variant="subtle" :label="sourceLabel(appearanceOverridden)" class="self-start" />
        </header>

        <UFormField label="App name" description="Shown in the sidebar header and browser tab title.">
          <UInput v-model="appearance.appName" class="w-full sm:w-72" placeholder="KNetraHub" />
        </UFormField>

        <UFormField label="Primary color" description="Drives buttons, links, and accents across the app.">
          <div class="flex flex-wrap items-center gap-3">
            <input v-model="appearance.primaryColor" type="color" class="size-10 cursor-pointer rounded border border-hull bg-transparent p-0.5">
            <UInput v-model="appearance.primaryColor" class="w-32 font-mono" placeholder="#2496ED" />
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="c in PRESET_COLORS"
                :key="c"
                type="button"
                class="size-6 rounded-full ring-1 ring-hull transition hover:scale-110"
                :style="{ background: c }"
                :aria-label="c"
                @click="appearance.primaryColor = c"
              />
            </div>
          </div>
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Horizontal logo" description="Used on the login screen.">
            <div class="flex items-center gap-3 rounded-lg border border-dashed border-hull p-3">
              <div class="flex h-12 w-32 items-center justify-center overflow-hidden rounded bg-surface-2">
                <img v-if="appearance.logoHorizontalUrl" :src="appearance.logoHorizontalUrl" alt="" class="max-h-full max-w-full object-contain">
                <KNetraHubLogo v-else size="sm" />
              </div>
              <div class="flex flex-col gap-1.5">
                <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-upload" label="Upload" @click="logoHorizontalInput?.click()" />
                <UButton v-if="appearance.logoHorizontalUrl" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" label="Use default" @click="clearLogo('logoHorizontalUrl')" />
              </div>
              <input ref="logoHorizontalInput" type="file" accept="image/*" class="hidden" @change="onLogoFileChange($event, 'logoHorizontalUrl')">
            </div>
          </UFormField>
          <UFormField label="Icon logo" description="Used in the sidebar and header.">
            <div class="flex items-center gap-3 rounded-lg border border-dashed border-hull p-3">
              <div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded bg-surface-2">
                <img v-if="appearance.logoIconUrl" :src="appearance.logoIconUrl" alt="" class="max-h-full max-w-full object-contain">
                <KNetraHubLogo v-else variant="icon" size="sm" />
              </div>
              <div class="flex flex-col gap-1.5">
                <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-upload" label="Upload" @click="logoIconInput?.click()" />
                <UButton v-if="appearance.logoIconUrl" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" label="Use default" @click="clearLogo('logoIconUrl')" />
              </div>
              <input ref="logoIconInput" type="file" accept="image/*" class="hidden" @change="onLogoFileChange($event, 'logoIconUrl')">
            </div>
          </UFormField>
          <UFormField label="Favicon" description="Browser tab icon. Small and square, e.g. 32x32 or 64x64.">
            <div class="flex items-center gap-3 rounded-lg border border-dashed border-hull p-3">
              <div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded bg-surface-2">
                <img v-if="appearance.faviconUrl" :src="appearance.faviconUrl" alt="" class="max-h-full max-w-full object-contain">
                <KNetraHubLogo v-else variant="icon" size="sm" />
              </div>
              <div class="flex flex-col gap-1.5">
                <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-upload" label="Upload" @click="faviconInput?.click()" />
                <UButton v-if="appearance.faviconUrl" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" label="Use default" @click="clearLogo('faviconUrl')" />
              </div>
              <input ref="faviconInput" type="file" accept="image/*" class="hidden" @change="onLogoFileChange($event, 'faviconUrl')">
            </div>
          </UFormField>
          <UFormField label="PWA / app icon" description="Installed-app and home-screen icon. Square, ideally 512x512 with safe padding.">
            <div class="flex items-center gap-3 rounded-lg border border-dashed border-hull p-3">
              <div class="flex h-12 w-12 items-center justify-center overflow-hidden rounded bg-surface-2">
                <img v-if="appearance.pwaIconUrl" :src="appearance.pwaIconUrl" alt="" class="max-h-full max-w-full object-contain">
                <KNetraHubLogo v-else variant="icon" size="sm" />
              </div>
              <div class="flex flex-col gap-1.5">
                <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-upload" label="Upload" @click="pwaIconInput?.click()" />
                <UButton v-if="appearance.pwaIconUrl" size="xs" color="neutral" variant="ghost" icon="i-lucide-x" label="Use default" @click="clearLogo('pwaIconUrl')" />
              </div>
              <input ref="pwaIconInput" type="file" accept="image/*" class="hidden" @change="onLogoFileChange($event, 'pwaIconUrl')">
            </div>
          </UFormField>
        </div>

        <footer class="flex flex-col gap-2 border-t border-hull pt-4 sm:flex-row sm:justify-end">
          <UButton color="neutral" variant="ghost" label="Revert preview" icon="i-lucide-undo-2" @click="revertAppearancePreview" />
          <UButton
            color="neutral"
            variant="ghost"
            label="Reset to defaults"
            icon="i-lucide-rotate-ccw"
            :disabled="!appearanceOverridden"
            :loading="resettingAppearance"
            @click="resetAppearanceToDefaults"
          />
          <UButton color="primary" label="Save appearance" icon="i-lucide-save" :loading="savingAppearance" @click="saveAppearanceSettings" />
        </footer>
      </section>

      <section class="panel p-5">
        <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2 mb-4">
          <UIcon name="i-lucide-eye" class="size-4 text-beacon" />
          Live preview
        </h3>
        <div class="overflow-hidden rounded-lg border border-hull">
          <div class="flex items-center gap-3 border-b border-hull-soft bg-ink px-4 py-3">
            <KNetraHubLogo variant="icon" class="size-8 shrink-0" />
            <span class="font-display text-sm font-semibold tracking-tight text-foam">{{ appearance.appName }}</span>
          </div>
          <div class="space-y-3 bg-surface p-4">
            <KNetraHubLogo size="sm" />
            <div class="flex flex-wrap gap-2">
              <UButton color="primary" label="Primary action" icon="i-lucide-rocket" />
              <UButton color="primary" variant="soft" label="Soft" />
              <UButton color="primary" variant="outline" label="Outline" />
              <UBadge color="primary" variant="subtle" label="Badge" />
            </div>
            <p class="text-xs text-(--color-muted)">
              This preview reflects the same CSS variables used across the whole console.
            </p>
          </div>
        </div>
      </section>

      <section class="panel p-5 space-y-4 xl:col-span-2">
        <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <h3 class="font-display text-sm font-semibold text-foam flex items-center gap-2">
              <UIcon name="i-lucide-tag" class="size-4 text-beacon" />
              Environment mode
            </h3>
            <p class="mt-1 text-xs text-(--color-muted)">
              Non-production modes stamp a corner tag across the top-right of the app logo, browser favicon, and installed-app (PWA) icons —
              <span class="font-semibold">Dev</span>, <span class="font-semibold">Test</span>, or <span class="font-semibold">STG</span> — so nobody mistakes a staging console for production. Production shows no tag.
            </p>
          </div>
          <UBadge
            :color="envMode.mode === 'production' ? 'neutral' : 'primary'"
            variant="subtle"
            :label="`Current: ${envMode.mode}${envMode.locked ? ' (locked)' : envMode.source === 'auto' ? ' (auto)' : ''}`"
            class="self-start capitalize"
          />
        </header>

        <p class="text-xs text-(--color-muted)">
          <UIcon :name="envMode.locked ? 'i-lucide-lock' : 'i-lucide-info'" class="mr-1 inline size-3.5 align-[-2px]" />{{ envSourceText }}
        </p>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Mode" :description="envMode.locked ? 'Managed by the deployment configuration.' : 'Leave on auto-detect unless this deployment needs a fixed mode.'">
            <USelect v-model="envModeChoice" :items="ENV_MODE_ITEMS" value-key="value" label-key="label" :disabled="envMode.locked" class="w-full sm:w-72" />
          </UFormField>

          <UFormField label="Badge color" description="Ribbon color for the Dev / Test / STG corner tag. Applies to every non-production mode.">
            <div class="flex flex-wrap items-center gap-3">
              <input v-model="appearance.envBadgeColor" type="color" class="size-10 cursor-pointer rounded border border-hull bg-transparent p-0.5">
              <UInput v-model="appearance.envBadgeColor" class="w-32 font-mono" placeholder="#DC2626" />
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="c in BADGE_PRESET_COLORS"
                  :key="c"
                  type="button"
                  class="size-6 rounded-full ring-1 ring-hull transition hover:scale-110"
                  :style="{ background: c }"
                  :aria-label="c"
                  @click="appearance.envBadgeColor = c"
                />
              </div>
            </div>
          </UFormField>
        </div>

        <!-- Live badge preview: the logo carries the current mode + color -->
        <div class="flex flex-wrap items-center gap-4 rounded-lg border border-hull bg-ink px-4 py-3">
          <KNetraHubLogo variant="icon" size="lg" />
          <div class="text-xs text-(--color-muted)">
            <p class="font-medium text-foam">Badge preview</p>
            <p>{{ envMode.mode === 'production' ? 'Production — no badge shown.' : `Non-production (${envMode.mode}) — logo, favicon, and PWA icons carry the “${envMode.label}” tag.` }}</p>
          </div>
          <UButton
            class="ml-auto"
            color="primary"
            label="Save"
            icon="i-lucide-save"
            :loading="savingEnvMode"
            @click="saveEnvModeSetting"
          />
        </div>

        <p class="text-[11px] text-faint">
          Already-installed PWAs keep their icon until reinstalled — browsers snapshot manifest icons at install time. Tabs and new installs pick the tagged icons up immediately.
        </p>
      </section>
    </div>
  </div>
</template>
