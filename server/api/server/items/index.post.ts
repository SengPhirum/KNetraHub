import { getDb } from '../../../utils/db'
import { nanoid } from 'nanoid'

// Create an item directly on a host (Zabbix "Create item").
export default defineEventHandler(async (event) => {
  const b = await readBody<{ host_id?: string; name?: string; key_?: string; type?: string; value_type?: string; units?: string; snmp_oid?: string; update_interval?: number }>(event)
  const hostId = (b.host_id || '').trim()
  const name = (b.name || '').trim()
  const key_ = (b.key_ || '').trim()
  if (!hostId || !name || !key_) throw createError({ statusCode: 400, statusMessage: 'host_id, name and key are required' })
  const db = getDb()
  const id = nanoid()
  await db.query(
    `INSERT INTO server_items (id, host_id, name, key_, type, value_type, units, snmp_oid, update_interval, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'enabled',$10)`,
    [id, hostId, name.slice(0, 120), key_.slice(0, 120), b.type || 'snmp', b.value_type || 'numeric',
      (b.units || '').slice(0, 40) || null, (b.snmp_oid || '').slice(0, 200) || null, Number(b.update_interval) || 60, new Date().toISOString()]
  )
  return { id }
})
