import type { H3Event } from 'h3'
import { requireUser, type SessionUser } from '~~/server/utils/auth'
import { requirePasswordConfirm } from '~~/server/utils/confirmAction'
import { deleteTier } from '~~/shared/utils/deleteTiers'

/**
 * Tiered confirmation for deleting a record, enforced server-side so a UI-only
 * dialog can't be bypassed with a direct API call. The tier comes from the
 * central registry (shared/utils/deleteTiers.ts) keyed by record `type`:
 *
 *   high   → re-prove the portal security password (delegates to
 *            requirePasswordConfirm - works for SSO too).
 *   medium → the caller must send the record's name in `x-confirm-name`,
 *            matched case-insensitively against `opts.name` when provided.
 *   low    → no extra proof; the yes/no click is UX only.
 *
 * API-token (Bearer) callers are exempt from the interactive tiers (they can't
 * answer a prompt); high still runs requirePasswordConfirm, which exempts
 * Bearer itself. Revoke the token to cut that path off.
 *
 * Pass `opts.name` (the record's canonical display name) so the medium tier can
 * verify the typed value - load the record first, then call this.
 */
export async function requireDeleteConfirm(
  event: H3Event,
  type: string,
  opts?: { name?: string }
): Promise<SessionUser> {
  const tier = deleteTier(type)
  if (tier === 'high') return requirePasswordConfirm(event)

  const user = await requireUser(event)
  if (tier === 'low') return user

  // medium
  const authHeader = getRequestHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) return user

  const typed = (getRequestHeader(event, 'x-confirm-name') || '').trim()
  if (!typed) {
    throw createError({ statusCode: 428, statusMessage: 'Type the record name to confirm deletion' })
  }
  const expected = (opts?.name ?? '').trim()
  if (expected && typed.toLowerCase() !== expected.toLowerCase()) {
    throw createError({ statusCode: 403, statusMessage: 'The name you typed does not match' })
  }
  return user
}
