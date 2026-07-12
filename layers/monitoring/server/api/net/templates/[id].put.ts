import { getDb } from '~~/server/utils/db'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Update a device template (full replace of its monitoring fields).
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const id = getRouterParam(event, 'id')
  const body = await readBody<Record<string, any>>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Template name is required' })

  const db = getDb()
  const exists = await db.query('SELECT id FROM net_device_templates WHERE id = $1', [id])
  if (!exists.rows.length) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

  await db.query(
    `UPDATE net_device_templates SET
       name = $1, description = $2, category = $3, poll_method = $4, snmp_version = $5, snmp_community = $6,
       snmp_sec_level = $7, snmp_auth_user = $8, snmp_auth_protocol = $9, snmp_auth_password = $10,
       snmp_priv_protocol = $11, snmp_priv_password = $12
     WHERE id = $13`,
    [
      name.slice(0, 120),
      (body.description || '').trim().slice(0, 300) || null,
      body.category || 'network',
      body.poll_method || 'snmp',
      body.snmp_version || null,
      body.snmp_community || null,
      body.snmp_sec_level || null,
      body.snmp_auth_user || null,
      body.snmp_auth_protocol || null,
      body.snmp_auth_password || null,
      body.snmp_priv_protocol || null,
      body.snmp_priv_password || null,
      id
    ]
  )
  return { success: true }
})
