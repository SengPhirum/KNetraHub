// Page guard for pages open to managers and admins (approval/oversight
// surfaces: audit review, reporting). UX-only - every API re-checks the
// global role server-side. Mirrors admin.ts but at the manager rank.
export default defineNuxtRouteMiddleware(async () => {
  const { user, fetchMe, can } = useAuth()
  if (user.value === null) await fetchMe().catch(() => null)
  if (!can('manager')) return navigateTo('/')
})
