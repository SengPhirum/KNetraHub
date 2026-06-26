<script setup lang="ts">
// KNetraHub logo. A hexagonal node-ring (network/fleet motif) crowned with an
// Angkor lotus finial, watching over a "Netra" (Sanskrit: eye) at its centre -
// the eye's iris carries a subtle segmented scanner ring for a digital feel.
// The built-in logo is an inline, theme-aware SVG (crisp at any size); an
// admin-uploaded override (Appearance settings) still wins and renders as <img>.
const props = withDefaults(defineProps<{
  variant?: 'horizontal' | 'icon'
  alt?: string
  size?: 'sm' | 'md' | 'lg'
  /** Small caption rendered beneath the wordmark - e.g. the current app's name
   *  while inside an app. Horizontal variant only. The two-tone "KNetra·Hub"
   *  brand wordmark stays exactly as on the portal home; the app name reads as a
   *  secondary subtitle, so each app keeps the portal identity. */
  caption?: string
}>(), {
  variant: 'horizontal',
  alt: 'KNetraHub',
  size: 'md',
  caption: ''
})

const { appearance } = useAppearance()
const uid = useId()

const override = computed(() => {
  if (props.variant === 'icon') {
    return appearance.value.logoIconUrl
      ? { src: appearance.value.logoIconUrl, width: 1024, height: 1024 }
      : null
  }
  return appearance.value.logoHorizontalUrl
    ? { src: appearance.value.logoHorizontalUrl, width: 2380, height: 612 }
    : null
})

const captionClass = { sm: 'text-[11px]', md: 'text-xs', lg: 'text-sm' } as const

const tileClass = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12' } as const
const textClass = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl' } as const
const overrideClass = computed(() =>
  props.variant === 'horizontal' ? { sm: 'h-8', md: 'h-10', lg: 'h-12' }[props.size] : ''
)
</script>

<template>
  <!-- Admin-uploaded override -->
  <img
    v-if="override"
    :src="override.src"
    :alt="alt"
    :width="override.width"
    :height="override.height"
    class="block h-auto max-w-full select-none"
    :class="overrideClass"
    decoding="async"
    draggable="false"
    loading="eager"
  >

  <!-- Built-in icon (Angkor ring + finial + digital eye on a beacon tile) -->
  <svg
    v-else-if="variant === 'icon'"
    viewBox="0 0 512 512"
    :class="tileClass[size]"
    class="block select-none"
    role="img"
    :aria-label="alt"
  >
    <defs>
      <linearGradient :id="`kn-${uid}`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--color-beacon, #2496ED)" />
        <stop offset="1" stop-color="#155e9c" />
      </linearGradient>
    </defs>
    <rect x="16" y="16" width="480" height="480" rx="116" :fill="`url(#kn-${uid})`" />
    <!-- hexagon node-ring -->
    <g fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round">
      <line x1="440" y1="286" x2="348" y2="126.7" />
      <line x1="348" y1="126.7" x2="164" y2="126.7" />
      <line x1="164" y1="126.7" x2="72" y2="286" />
      <line x1="72" y1="286" x2="164" y2="445.3" />
      <line x1="164" y1="445.3" x2="348" y2="445.3" />
      <line x1="348" y1="445.3" x2="440" y2="286" />
    </g>
    <g fill="#fff">
      <circle cx="440" cy="286" r="22" /><circle cx="348" cy="126.7" r="22" /><circle cx="164" cy="126.7" r="22" />
      <circle cx="72" cy="286" r="22" /><circle cx="164" cy="445.3" r="22" /><circle cx="348" cy="445.3" r="22" />
      <!-- Angkor lotus finial -->
      <rect x="232" y="98" width="48" height="11" rx="4" />
      <path d="M236 98 C 240 86 272 86 276 98 Z" />
      <path d="M238 90 C 224 84 222 70 230 60 C 234 74 240 80 246 86 Z" />
      <path d="M274 90 C 288 84 290 70 282 60 C 278 74 272 80 266 86 Z" />
      <path d="M256 38 C 244 60 240 78 248 90 C 252 96 260 96 264 90 C 272 78 268 60 256 38 Z" />
    </g>
    <!-- digital eye -->
    <path d="M150 292 C 198 230 314 230 362 292 C 314 354 198 354 150 292 Z" fill="none" stroke="#fff" stroke-width="15" stroke-linejoin="round" />
    <circle cx="256" cy="292" r="48" fill="none" stroke="#fff" stroke-width="8" stroke-dasharray="30 15" />
    <circle cx="256" cy="292" r="29" fill="#fff" />
    <circle cx="256" cy="292" r="14" fill="#1d72bd" />
    <circle cx="245" cy="281" r="5" fill="#fff" />
  </svg>

  <!-- Built-in horizontal wordmark (icon tile + text) -->
  <div v-else class="flex select-none items-center gap-2.5">
    <svg viewBox="0 0 512 512" :class="tileClass[size]" class="block shrink-0" role="img" :aria-label="alt">
      <defs>
        <linearGradient :id="`knw-${uid}`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="var(--color-beacon, #2496ED)" />
          <stop offset="1" stop-color="#155e9c" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="116" :fill="`url(#knw-${uid})`" />
      <g fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round">
        <line x1="440" y1="286" x2="348" y2="126.7" />
        <line x1="348" y1="126.7" x2="164" y2="126.7" />
        <line x1="164" y1="126.7" x2="72" y2="286" />
        <line x1="72" y1="286" x2="164" y2="445.3" />
        <line x1="164" y1="445.3" x2="348" y2="445.3" />
        <line x1="348" y1="445.3" x2="440" y2="286" />
      </g>
      <g fill="#fff">
        <circle cx="440" cy="286" r="22" /><circle cx="348" cy="126.7" r="22" /><circle cx="164" cy="126.7" r="22" />
        <circle cx="72" cy="286" r="22" /><circle cx="164" cy="445.3" r="22" /><circle cx="348" cy="445.3" r="22" />
        <rect x="232" y="98" width="48" height="11" rx="4" />
        <path d="M236 98 C 240 86 272 86 276 98 Z" />
        <path d="M238 90 C 224 84 222 70 230 60 C 234 74 240 80 246 86 Z" />
        <path d="M274 90 C 288 84 290 70 282 60 C 278 74 272 80 266 86 Z" />
        <path d="M256 38 C 244 60 240 78 248 90 C 252 96 260 96 264 90 C 272 78 268 60 256 38 Z" />
      </g>
      <path d="M150 292 C 198 230 314 230 362 292 C 314 354 198 354 150 292 Z" fill="none" stroke="#fff" stroke-width="15" stroke-linejoin="round" />
      <circle cx="256" cy="292" r="48" fill="none" stroke="#fff" stroke-width="8" stroke-dasharray="30 15" />
      <circle cx="256" cy="292" r="29" fill="#fff" />
      <circle cx="256" cy="292" r="14" fill="#1d72bd" />
      <circle cx="245" cy="281" r="5" fill="#fff" />
    </svg>
    <span class="flex min-w-0 flex-col">
      <span
        class="font-display font-semibold leading-none tracking-tight"
        :class="textClass[size]"
        style="color: var(--color-foam)"
      >KNetra<span style="color: var(--color-beacon, #2496ED)">Hub</span></span>
      <span
        v-if="caption"
        class="mt-1 truncate font-display font-medium uppercase leading-none tracking-[0.14em]"
        :class="captionClass[size]"
        style="color: var(--color-muted)"
      >{{ caption }}</span>
    </span>
  </div>
</template>
