import { requireRole } from '~~/server/utils/auth'
import { validateComposeStructure, checkComposeAgainstDocker, type ValidationResult } from '~~/layers/docker/server/utils/stack'

/**
 * Read-only pre-deploy check: structural validation (YAML parses, services
 * have images, referenced networks/configs/secrets are declared) plus live
 * Docker-state checks (external resources exist, which non-external
 * secrets/configs still need their content collected before deploy can
 * create them). Called on every form/YAML edit (debounced) and once more
 * right before the Deploy button proceeds.
 */
export default defineEventHandler(async (event): Promise<ValidationResult> => {
  await requireRole(event, 'operator')
  const body = await readBody<{ name: string; compose: string }>(event)

  const { compose, errors, warnings } = validateComposeStructure(body.name, body.compose || '')
  if (errors.length) {
    return { valid: false, errors, warnings, needsSecrets: [], needsConfigs: [] }
  }

  try {
    const live = await checkComposeAgainstDocker(body.name, compose)
    return { valid: true, errors, warnings: [...warnings, ...live.warnings], needsSecrets: live.needsSecrets, needsConfigs: live.needsConfigs }
  } catch (err: any) {
    // Docker/swarm unreachable - structural checks already passed, so don't
    // block the form on an infra hiccup; the real deploy call re-validates.
    return { valid: true, errors, warnings: [...warnings, `Could not verify against Docker: ${err?.statusMessage || err?.message || 'unknown error'}`], needsSecrets: [], needsConfigs: [] }
  }
})
