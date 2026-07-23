import { requirePamPermission } from '~~/layers/pam/server/utils/pamStore'
import { listConnectors, connectorDescriptor } from '~~/layers/pam/server/connectors/registry'

/** Connector catalog (secret-free descriptors) for the admin UI. */
export default defineEventHandler(async (event) => {
  await requirePamPermission(event, 'pam.connector.view')
  return listConnectors().map(connectorDescriptor)
})
