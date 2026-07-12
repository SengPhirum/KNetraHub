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

// Custom favicon/PWA icon override the built-in static files. A data: URL
// (uploaded image) or http(s) URL works directly as a <link> href - no
// dedicated image-serving route needed, same as the logo overrides.
const faviconLinks = computed(() => {
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

useHead({
  title: computed(() => `${appearance.value.appName} - Swarm Console`),
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
