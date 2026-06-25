<script setup lang="ts">
// Admin > General > Appearance. Rebrand the running app (name, primary color,
// logos, favicon, PWA icon) without a rebuild. Was a tab in the old /settings.
definePageMeta({ middleware: 'admin' })

const toast = useToast()
const { appearance, overridden: appearanceOverridden, previewAppearance, saveAppearance, resetAppearance, fetchAppearance } = useAppearance()

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
                <DockHubLogo v-else size="sm" />
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
                <DockHubLogo v-else variant="icon" size="sm" />
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
                <DockHubLogo v-else variant="icon" size="sm" />
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
                <DockHubLogo v-else variant="icon" size="sm" />
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
            <DockHubLogo variant="icon" class="size-8 shrink-0" />
            <span class="font-display text-sm font-semibold tracking-tight text-foam">{{ appearance.appName }}</span>
          </div>
          <div class="space-y-3 bg-surface p-4">
            <DockHubLogo size="sm" />
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
    </div>
  </div>
</template>
