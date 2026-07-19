import { requireUser } from '~~/server/utils/auth'
import { listModuleRuntimeStates } from '~~/server/utils/moduleDb'
import { BUILTIN_MODULES } from '../../../shared/moduleCatalog'

/** Runtime module directory. Database details are visible to portal admins only. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const states = await listModuleRuntimeStates(user.role === 'admin')
  return {
    modules: BUILTIN_MODULES.map((definition) => ({
      ...definition,
      ...states.find((state) => state.key === definition.key)
    }))
  }
})
