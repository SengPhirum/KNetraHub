import { migrate, waitForDb } from '../utils/db'
import { closeAllModuleDbs, ensureModuleDatabaseConfigs } from '../utils/moduleDb'

/** Load runtime module configuration after the portal schema is available. */
export default defineNitroPlugin(async (nitroApp) => {
  if (useRuntimeConfig().public.staticDocs) return
  await waitForDb()
  await migrate()
  await ensureModuleDatabaseConfigs(true)
  nitroApp.hooks.hook('close', closeAllModuleDbs)
})
