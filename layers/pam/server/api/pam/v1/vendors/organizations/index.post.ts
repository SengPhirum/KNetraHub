import { requirePamPermission, pamAudit } from '~~/layers/pam/server/utils/pamStore'
import { createOrg } from '~~/layers/pam/server/utils/pamVendor'

export default defineEventHandler(async (event) => {
  const { user } = await requirePamPermission(event, 'pam.safe.manage')
  const body = await readBody(event)
  if (!String(body?.name || '').trim()) throw createError({ statusCode: 400, statusMessage: 'name is required' })
  const id = await createOrg({
    name: body.name, sponsor: body.sponsor, contractStart: body.contract_start, contractEnd: body.contract_end,
    allowedCountries: body.allowed_countries, allowedNetworks: body.allowed_networks, actor: user.username
  })
  await pamAudit(event, user, { action: 'vendor.org.create', objectType: 'vendor', objectId: id, severity: 'notice', details: { name: body.name } })
  return { id }
})
