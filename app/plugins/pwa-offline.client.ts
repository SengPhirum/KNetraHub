// Tells the user once the PWA's service worker has finished precaching and
// the app can keep working without a connection. offlineReady only ever
// flips true once, on first activation - see @vite-pwa/nuxt's PwaInjection.
export default defineNuxtPlugin(() => {
  const pwa = usePWA()
  if (!pwa) return

  const toast = useToast()
  watch(
    () => pwa.offlineReady,
    (ready) => {
      if (!ready) return
      toast.add({
        title: 'Ready to work offline',
        description: 'KNetraHub has cached what it needs and will keep working without a connection.',
        color: 'primary',
        icon: 'i-lucide-wifi-off'
      })
    }
  )
})
