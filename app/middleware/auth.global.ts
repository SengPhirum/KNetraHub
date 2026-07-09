export default defineNuxtRouteMiddleware(async (to) => {
  const isPublicDocs = to.path === '/documentation'
  if (isPublicDocs) return

  // First-run setup wizard: takes priority over the normal auth redirect -
  // there's no one to log in as yet. Cached in useState so this only ever
  // fetches once per session, same pattern as the user session hydration below.
  const { setupRequired, fetchSetupStatus } = useSetupStatus()
  if (setupRequired.value === null) {
    await fetchSetupStatus()
  }
  const isSetup = to.path === '/setup'
  if (setupRequired.value && !isSetup) return navigateTo('/setup')
  if (!setupRequired.value && isSetup) return navigateTo('/login')
  if (isSetup) return

  const { user, fetchMe } = useAuth()

  // hydrate session once
  if (user.value === null) {
    await fetchMe().catch(() => null)
  }

  const isLogin = to.path === '/login'

  if (!user.value && !isLogin) {
    return navigateTo('/login')
  }
  if (user.value && isLogin) {
    return navigateTo('/')
  }
})
