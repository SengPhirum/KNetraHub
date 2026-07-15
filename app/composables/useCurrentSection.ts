/**
 * Which portal section the current route belongs to - an app module
 * (Docker/Monitoring/IP Management) or the portal-admin area (Users, Audit,
 * everything under /admin) - and its display name, or undefined on the
 * full-page home launcher / auth pages. Shared by the layout's "Exit {App}"
 * header button and the document title (see app/app.vue).
 */
export function useCurrentSection() {
  const route = useRoute()
  const inAdminArea = computed(() => isAdminRoute(route.path))
  const appKey = computed(() => appKeyForRoute(route.path))
  const inApp = computed(() => appKey.value !== null || inAdminArea.value)
  const name = computed(() => {
    if (inAdminArea.value) return 'Admin'
    return appKey.value ? getModuleRegistry().find((m) => m.key === appKey.value)?.name : undefined
  })
  return { name, inAdminArea, inApp, appKey }
}
