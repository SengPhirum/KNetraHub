import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import { requireMonitoring } from '~~/layers/monitoring/server/utils/monitoringAuth'

// Add an item definition to a template.
export default defineEventHandler(async (event) => {
  await requireMonitoring(event, 'manager')
  const templateId = getRouterParam(event, 'id')
  const b = await readBody<{ name?: string; key_?: string; type?: string; value_type?: string; units?: string; snmp_oid?: string; update_interval?: number }>(event)
  const name = (b.name || '').trim()
  const key_ = (b.key_ || '').trim()
  if (!name || !key_) throw createError({ statusCode: 400, statusMessage: 'Name and key are required' })
  const db = getDb()
  const id = nanoid()
  await db.query(
    `INSERT INTO server_template_items (id, template_id, name, key_, type, value_type, units, snmp_oid, update_interval)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, templateId, name.slice(0, 120), key_.slice(0, 120), b.type || 'snmp', b.value_type || 'numeric',
      (b.units || '').slice(0, 40) || null, (b.snmp_oid || '').slice(0, 200) || null, Number(b.update_interval) || 60]
  )
  return { id }
})
