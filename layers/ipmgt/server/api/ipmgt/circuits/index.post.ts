import { nanoid } from 'nanoid'
import { getIpamDb as getDb } from '~~/server/utils/moduleDb'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

const CIRCUIT_TYPES = ['physical', 'logical', 'virtual']
const STATUSES = ['active', 'planned', 'suspended', 'decommissioned']

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const body = await readBody(event)
  const circuitRef = String(body?.circuit_ref || '').trim()
  if (!circuitRef) throw createError({ statusCode: 400, statusMessage: 'Circuit ID/reference is required' })

  const id = nanoid()
  const now = new Date().toISOString()
  await getDb().query(
    `INSERT INTO ipmgt_circuits (
      id, circuit_ref, provider_id, circuit_type, status, bandwidth, description, customer_id,
      order_reference, install_date, expiry_date,
      endpoint_a_location_id, endpoint_a_device_id, endpoint_a_note,
      endpoint_b_location_id, endpoint_b_device_id, endpoint_b_note,
      notes, created_at, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      id, circuitRef, body.provider_id || null,
      CIRCUIT_TYPES.includes(body.circuit_type) ? body.circuit_type : 'physical',
      STATUSES.includes(body.status) ? body.status : 'active',
      body.bandwidth || null, body.description || null, body.customer_id || null,
      body.order_reference || null, body.install_date || null, body.expiry_date || null,
      body.endpoint_a_location_id || null, body.endpoint_a_device_id || null, body.endpoint_a_note || null,
      body.endpoint_b_location_id || null, body.endpoint_b_device_id || null, body.endpoint_b_note || null,
      body.notes || null, now, user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.circuit.create', id, { circuit_ref: circuitRef })
  return { id }
})
