<script setup lang="ts">
const config = useRuntimeConfig()
// Static docs build (GitHub Pages): no server, no DB - skip the appearance
// fetch entirely (defaults already carry the right name/color) and never
// reference the dynamic manifest route, which only exists on a live server.
const staticDocs = config.public.staticDocs

const { appearance, htmlStyle, fetchAppearance } = useAppearance()
const { envMode, fetchEnvMode } = useEnvMode()
if (!staticDocs) await Promise.all([fetchAppearance(), fetchEnvMode()])

// Docs builds are served under a subpath (e.g. /knetrahub/ on GitHub Pages),
// so built-in asset hrefs must carry the configured baseURL. In the normal
// app baseURL is "/" and this is a no-op.
const assetBase = (config.app.baseURL || '/').replace(/\/$/, '')
const asset = (path: string) => `${assetBase}${path}`

function mimeFromDataUrl(url: string): string | undefined {
  const match = /^data:([^;,]+)/.exec(url)
  return match?.[1]
}

// Custom favicon/PWA icon override the built-in static files. A data: URL
// (uploaded image, or a color-tinted PNG server-generated when an admin
// customizes the primary color without uploading their own - see
// server/utils/appearanceSettings.ts) works directly as a <link> href - no
// dedicated image-serving route needed, same as the logo overrides.
const faviconLinks = computed(() => {
  // Non-production environment mode: favicon + touch icon switch to the
  // server-composited variants carrying the mode's corner tag ("Dev"/"Test"/
  // "STG"), so every browser tab and home-screen icon is distinguishable
  // from production at a glance. See server/routes/env-badged/[file].get.ts.
  if (!staticDocs && envMode.value.mode !== 'production') {
    return [
      { rel: 'icon', href: '/env-badged/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/env-badged/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/env-badged/favicon-16x16.png' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/env-badged/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.webmanifest' }
    ]
  }
  const favicon = appearance.value.faviconUrl
  const appIcon = appearance.value.pwaIconUrl
  const links: any[] = favicon
    ? [{ rel: 'icon', href: favicon, sizes: 'any', type: mimeFromDataUrl(favicon) }]
    : [
        { rel: 'icon', href: asset('/favicon.ico'), sizes: 'any' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: asset('/favicon-32x32.png') },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: asset('/favicon-16x16.png') }
      ]
  links.push(
    appIcon
      ? { rel: 'apple-touch-icon', href: appIcon, type: mimeFromDataUrl(appIcon) }
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
