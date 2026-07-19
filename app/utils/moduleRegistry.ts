import type { ModuleDefinition } from '../../shared/types/module'
import { BUILTIN_MODULES } from '~~/shared/moduleCatalog'

/**
 * KNetraHub module registry - the apps shown on the home launcher. Every app
 * is served in-process by this app; there are no Module-Federation remotes
 * anymore. Each module's sources live in their own Nuxt layer under
 * layers/<key>/ (app/pages, app/components, server/api, server/utils, ...),
 * auto-registered by Nuxt and merged into the app with unchanged URLs.
 * A new app needs a layers/<key>/ folder, a registry entry, and its access
 * wiring (permission + nav group), not bespoke nav code.
 */
export function getModuleRegistry(): ModuleDefinition[] {
  return [...BUILTIN_MODULES].sort((a, b) => a.order - b.order)
}
