import { getDb } from '../../utils/db'
import { nanoid } from 'nanoid'

// Create a device template. Stores the same monitoring fields a device carries
// (minus hostname/ip) so onboarding a new device is a single pick.
export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const name = (body.name || '').trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Template name is required' })

  const db = getDb()
  const id = nanoid()
  await db.query(
    `INSERT INTO net_device_templates
      (id, name, description, category, poll_method, snmp_version, snmp_community,
       snmp_sec_level, snmp_auth_user, snmp_auth_protocol, snmp_auth_password,
       snmp_priv_protocol, snmp_priv_password, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id,
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
      new Date().toISOString()
    ]
  )
  return { id }
})
