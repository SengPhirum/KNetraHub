// Client-side per-app access guard. If a route belongs to an app the user
// can't reach, send them back to the launcher with a toast. This is UX only -
// the server-side appAccess middleware (Dock) and each subsystem API are the
// real boundaries.
export default defineNuxtRouteMiddleware(async (to) => {
  // Static docs build: no server, no session - auth.global already funnels
  // everything to /documentation, so never hydrate a session here.
  if (useRuntimeConfig().public.staticDocs) return

  // Public / unauthenticated routes are handled by auth.global.ts.
  if (to.path === '/login' || to.path === '/documentation') return

  const { user, fetchMe, hasApp } = useAuth()
  // Be order-independent w.r.t. auth.global: hydrate the session if needed.
  if (user.value === null) await fetchMe().catch(() => null)
  if (!user.value) return // auth.global will redirect to /login

  const app = appKeyForRoute(to.path)
  if (!app || hasApp(app)) return

  if (import.meta.client) {
    useToast().add({
      title: 'No access',
      description: `You don't have access to that app.`,
      color: 'warning'
    })
  }
  return navigateTo('/')
})
