<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean; showMeta?: boolean }>(), { compact: false, showMeta: false })

const colorMode = useColorMode()

const CYCLE = ['system', 'dark', 'light'] as const
type ThemePreference = typeof CYCLE[number]

const options: Array<{ value: ThemePreference; label: string; icon: string; hint: string }> = [
  { value: 'system', label: 'System', icon: 'i-lucide-monitor-smartphone', hint: 'Follow your device preference' },
  { value: 'dark',   label: 'Dark',   icon: 'i-lucide-moon-star',           hint: 'Low-glare operations workspace' },
  { value: 'light',  label: 'Light',  icon: 'i-lucide-sun-medium',          hint: 'Bright, high-contrast workspace' }
]

const preference = computed<ThemePreference>({
  get:  () => CYCLE.includes(colorMode.preference as ThemePreference) ? colorMode.preference as ThemePreference : 'system',
  set:  (v) => { colorMode.preference = v }
})

const current = computed(() => options.find((o) => o.value === preference.value) ?? options[0])

function cycle() {
  const idx = CYCLE.indexOf(preference.value)
  preference.value = CYCLE[(idx + 1) % CYCLE.length]
}

const resolvedLabel = computed(() => colorMode.value === 'dark' ? 'Dark' : 'Light')
</script>

<template>
  <ClientOnly>
    <!-- ── compact: single cycling icon button ── -->
    <UButton
      v-if="compact"
      :icon="current.icon"
      color="neutral"
      variant="ghost"
      :title="`Theme: ${current.label} — click to cycle`"
      :aria-label="`Current theme: ${current.label}. Click to switch.`"
      @click="cycle"
    />

    <!-- ── full: 3-segment selector ── -->
    <div v-else class="space-y-2">
      <div class="panel-flush rounded-2xl p-1.5">
        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition"
            :class="preference === option.value
              ? 'bg-beacon/12 text-foam ring-1 ring-inset ring-beacon/30'
              : 'text-(--color-muted) hover:bg-(--color-veil) hover:text-foam'"
            :title="option.hint"
            :aria-label="`Switch theme to ${option.label}`"
            :aria-pressed="preference === option.value"
            @click="preference = option.value"
          >
            <UIcon
              :name="option.icon"
              class="size-4 shrink-0"
              :class="preference === option.value ? 'text-beacon' : 'text-faint'"
            />
            <span class="font-medium">{{ option.label }}</span>
          </button>
        </div>
      </div>

      <p v-if="showMeta" class="px-1 text-xs text-faint">
        {{ preference === 'system' ? `Following device setting (${resolvedLabel})` : `${resolvedLabel} mode stays active until you change it.` }}
      </p>
    </div>

    <template #fallback>
      <!-- compact fallback -->
      <div v-if="compact" class="size-8 skeleton rounded-lg" />
      <!-- full fallback -->
      <div v-else class="panel-flush rounded-2xl p-1.5">
        <div class="grid grid-cols-3 gap-1">
          <div v-for="option in options" :key="option.value"
            class="flex min-w-0 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm text-faint opacity-60">
            <UIcon :name="option.icon" class="size-4 shrink-0" />
            <span class="font-medium">{{ option.label }}</span>
          </div>
        </div>
      </div>
    </template>
  </ClientOnly>
</template>
