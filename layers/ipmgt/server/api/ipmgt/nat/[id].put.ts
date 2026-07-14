import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { isValidIp, isValidCidr } from '~~/layers/ipmgt/server/utils/ipam'

const RULE_TYPES = ['static', 'source', 'destination', 'policy']

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_nat_rules WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'NAT rule not found' })
  const row = cur.rows[0]

  let translated = row.translated_address
  if (body.translated_address !== undefined) {
    const s = String(body.translated_address || '').trim()
    if (!s) throw createError({ statusCode: 400, statusMessage: 'Translated address is required' })
    if (s.includes('/') ? !isValidCidr(s) : !isValidIp(s)) throw createError({ statusCode: 400, statusMessage: `Invalid translated address: ${s}` })
    translated = s
  }
  const g = (k: string, d: any) => (body[k] === undefined ? d : (body[k] || null))

  await db.query(
    `UPDATE ipmgt_nat_rules SET
       rule_type=$2, source_ip_id=$3, source_subnet_id=$4, source_text=$5, translated_address=$6,
       protocol=$7, port=$8, device_id=$9, description=$10, customer_id=$11, enabled=$12, updated_at=$13, updated_by=$14
     WHERE id=$1`,
    [
      id,
      body.rule_type === undefined ? row.rule_type : (RULE_TYPES.includes(body.rule_type) ? body.rule_type : row.rule_type),
      g('source_ip_id', row.source_ip_id), g('source_subnet_id', row.source_subnet_id), g('source_text', row.source_text),
      translated, g('protocol', row.protocol), g('port', row.port), g('device_id', row.device_id),
      g('description', row.description), g('customer_id', row.customer_id),
      body.enabled === undefined ? row.enabled : !!body.enabled,
      new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.nat.update', id, { translated_address: translated })
  return { id }
})
