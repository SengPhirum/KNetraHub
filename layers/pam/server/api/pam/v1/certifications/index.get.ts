import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { listCampaigns } from '~~/layers/pam/server/utils/pamCertification'

/** List access-certification campaigns with per-campaign decision counts. */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.certification.view')
  return listCampaigns()
})
