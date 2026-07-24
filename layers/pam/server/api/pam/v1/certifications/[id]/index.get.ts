import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { getCampaign } from '~~/layers/pam/server/utils/pamCertification'

/** A single campaign with its items and decision counts. */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.certification.view')
  const id = getRouterParam(event, 'id')!
  const campaign = await getCampaign(id)
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found' })
  return campaign
})
