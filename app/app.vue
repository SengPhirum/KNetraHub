<script setup lang="ts">
const config = useRuntimeConfig()
// Static docs build (GitHub Pages): no server, no DB - skip the appearance
// fetch entirely (defaults already carry the right name/color) and never
// reference the dynamic manifest route, which only exists on a live server.
const staticDocs = config.public.staticDocs

const { appearance, htmlStyle, fetchAppearance } = useAppearance()
if (!staticDocs) await fetchAppearance()

// Docs builds are served under a subpath (e.g. /knetrahub/ on GitHub Pages),
// so built-in asset hrefs must carry the configured baseURL. In the normal
// app baseURL is "/" and this is a no-op.
const assetBase = (config.app.baseURL || '/').replace(/\/$/, '')
const asset = (path: string) => `${assetBase}${path}`

function mimeFromDataUrl(url: string): string | undefined {
  const match = /^data:([^;,]+)/.exec(url)
  return match?.[1]
}

// When an admin customizes the primary color but hasn't uploaded their own
// favicon/PWA icon, auto-tint the built-in mark to that color instead of
// silently keeping the default-blue static files (see shared/utils/brandIcon.ts).
// SVG only - no server-side rasterization dependency - so this covers the
// browser tab icon and Android's "Add to Home Screen" icon; iOS Safari doesn't
// support SVG apple-touch-icons and falls back to its own default there.
const autoTintedIcon = computed(() => {
  if (appearance.value.primaryColor === DEFAULT_PRIMARY_COLOR) return null
  return svgToDataUrl(generateBrandIconSvg(appearance.value.primaryColor))
})

// Custom favicon/PWA icon override the built-in static files. A data: URL
// (uploaded image) or http(s) URL works directly as a <link> href - no
// dedicated image-serving route needed, same as the logo overrides.
const faviconLinks = computed(() => {
  const favicon = appearance.value.faviconUrl
  const appIcon = appearance.value.pwaIconUrl
  const auto = autoTintedIcon.value
  const links: any[] = favicon
    ? [{ rel: 'icon', href: favicon, sizes: 'any', type: mimeFromDataUrl(favicon) }]
    : auto
      ? [{ rel: 'icon', href: auto, sizes: 'any', type: 'image/svg+xml' }]
      : [
          { rel: 'icon', href: asset('/favicon.ico'), sizes: 'any' },
          { rel: 'icon', type: 'image/png', sizes: '32x32', href: asset('/favicon-32x32.png') },
          { rel: 'icon', type: 'image/png', sizes: '16x16', href: asset('/favicon-16x16.png') }
        ]
  links.push(
    appIcon
      ? { rel: 'apple-touch-icon', href: appIcon, type: mimeFromDataUrl(appIcon) }
      : auto
        ? { rel: 'apple-touch-icon', href: auto, type: 'image/svg+xml' }
        : { rel: 'apple-touch-icon', sizes: '180x180', href: asset('/apple-touch-icon.png') }
  )
  // Manifest content (including icons) is generated per-request by
  // server/routes/manifest.webmanifest.get.ts, reading the same appearance
  // settings - replaces @vite-pwa/nuxt's build-time static manifest, which
  // can't pick up an admin-uploaded icon without a full rebuild. No server
  // route exists on a static docs deploy, so the link is skipped there.
  if (!staticDocs) links.push({ rel: 'manifest', href: '/manifest.webmanifest' })
  return links
})

// Document title follows whichever app/section the user is currently in
// (Docker / Monitoring / IP Management / Admin), falling back to just the
// app name on the portal home and other top-level pages (login, docs).
const { name: currentSectionName } = useCurrentSection()

useHead({
  title: computed(() => currentSectionName.value ? `${appearance.value.appName} - ${currentSectionName.value}` : appearance.value.appName),
  htmlAttrs: { style: htmlStyle },
  link: faviconLinks,
  meta: [
    { name: 'theme-color', content: computed(() => appearance.value.primaryColor) },
    { name: 'msapplication-TileColor', content: computed(() => appearance.value.primaryColor) }
  ]
})
</script>

<template>
  <UApp :toaster="{ position: 'bottom-left' }">
    <NuxtLayout>
      <NuxtPage :transition="{ name: 'page', mode: 'out-in' }" />
    </NuxtLayout>
  </UApp>
</template>
