// Page guard for the portal admin area (/admin/*, plus the existing /users and
// /audit pages). UX-only - every admin API re-checks the global role server-side.
export default defineNuxtRouteMiddleware(async () => {
  const { user, fetchMe, can } = useAuth()
  // Be order-independent w.r.t. auth.global: hydrate the session if needed.
  if (user.value === null) await fetchMe().catch(() => null)
  if (!can('admin')) return navigateTo('/')
})
