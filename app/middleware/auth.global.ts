export default defineNuxtRouteMiddleware(async (to) => {
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
