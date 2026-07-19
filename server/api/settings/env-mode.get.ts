import { getEnvModeState } from '~~/server/utils/envModeState'

/** Unauthenticated, like appearance.get: the login screen renders the logo
 *  (and its environment badge) before anyone signs in. Nothing secret here -
 *  the mode is derivable from the domain anyway. */
export default defineEventHandler(async (event) => {
  // Static docs build: no database - plain production (no badge).
  if (useRuntimeConfig().public.staticDocs) {
    return { mode: 'production', source: 'auto', locked: false, label: '', adminMode: '' }
  }
  return await getEnvModeState(event)
})
