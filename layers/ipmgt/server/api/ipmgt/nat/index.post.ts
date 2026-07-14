import { nanoid } from 'nanoid'
import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'
import { isValidIp, isValidCidr } from '~~/layers/ipmgt/server/utils/ipam'

const RULE_TYPES = ['static', 'source', 'destination', 'policy']

function validateTranslated(addr: string) {
  const s = String(addr || '').trim()
  if (!s) throw createError({ statusCode: 400, statusMessage: 'Translated address is required' })
  if (s.includes('/') ? !isValidCidr(s) : !isValidIp(s)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid translated address: ${s}` })
  }
  return s
}

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  const sourceCount = [body.source_ip_id, body.source_subnet_id, body.source_text].filter(Boolean).length
  if (sourceCount !== 1) throw createError({ statusCode: 400, statusMessage: 'Specify exactly one source: an address, a subnet, or free-text' })
  const translated = validateTranslated(body.translated_address)

  const id = nanoid()
  const now = new Date().toISOString()
  await getDb().query(
    `INSERT INTO ipmgt_nat_rules (
      id, rule_type, source_ip_id, source_subnet_id, source_text, translated_address,
      protocol, port, device_id, description, customer_id, enabled, created_at, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id, RULE_TYPES.includes(body.rule_type) ? body.rule_type : 'static',
      body.source_ip_id || null, body.source_subnet_id || null, body.source_text || null, translated,
      body.protocol || null, body.port || null, body.device_id || null, body.description || null,
      body.customer_id || null, body.enabled === undefined ? true : !!body.enabled, now, user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.nat.create', id, { translated_address: translated })
  return { id }
})
