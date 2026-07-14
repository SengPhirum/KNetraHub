import { getDb } from '~~/server/utils/db'
import { requireIpam, ipamAudit } from '~~/layers/ipmgt/server/utils/ipamStore'

const CIRCUIT_TYPES = ['physical', 'logical', 'virtual']
const STATUSES = ['active', 'planned', 'suspended', 'decommissioned']

export default defineEventHandler(async (event) => {
  const user = await requireIpam(event, 'operator')
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = getDb()
  const cur = await db.query('SELECT * FROM ipmgt_circuits WHERE id = $1', [id])
  if (!cur.rows.length) throw createError({ statusCode: 404, statusMessage: 'Circuit not found' })
  const row = cur.rows[0]
  const circuitRef = body.circuit_ref !== undefined ? String(body.circuit_ref).trim() : row.circuit_ref
  if (!circuitRef) throw createError({ statusCode: 400, statusMessage: 'Circuit ID/reference is required' })
  const g = (k: string, d: any) => (body[k] === undefined ? d : (body[k] || null))

  await db.query(
    `UPDATE ipmgt_circuits SET
       circuit_ref=$2, provider_id=$3, circuit_type=$4, status=$5, bandwidth=$6, description=$7, customer_id=$8,
       order_reference=$9, install_date=$10, expiry_date=$11,
       endpoint_a_location_id=$12, endpoint_a_device_id=$13, endpoint_a_note=$14,
       endpoint_b_location_id=$15, endpoint_b_device_id=$16, endpoint_b_note=$17,
       notes=$18, updated_at=$19, updated_by=$20
     WHERE id=$1`,
    [
      id, circuitRef, g('provider_id', row.provider_id),
      body.circuit_type === undefined ? row.circuit_type : (CIRCUIT_TYPES.includes(body.circuit_type) ? body.circuit_type : row.circuit_type),
      body.status === undefined ? row.status : (STATUSES.includes(body.status) ? body.status : row.status),
      g('bandwidth', row.bandwidth), g('description', row.description), g('customer_id', row.customer_id),
      g('order_reference', row.order_reference), g('install_date', row.install_date), g('expiry_date', row.expiry_date),
      g('endpoint_a_location_id', row.endpoint_a_location_id), g('endpoint_a_device_id', row.endpoint_a_device_id), g('endpoint_a_note', row.endpoint_a_note),
      g('endpoint_b_location_id', row.endpoint_b_location_id), g('endpoint_b_device_id', row.endpoint_b_device_id), g('endpoint_b_note', row.endpoint_b_note),
      g('notes', row.notes), new Date().toISOString(), user.username
    ]
  )
  await ipamAudit(user, 'ipmgt.circuit.update', id, { circuit_ref: circuitRef })
  return { id }
})
