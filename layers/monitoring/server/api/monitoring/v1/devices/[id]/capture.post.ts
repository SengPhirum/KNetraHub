import { requireMonitoring } from '../../../../../utils/monitoringAuth'
import { monDb, idParam, notFound, badRequest, auditMonitoring } from '../../../../../utils/monApi'
import { resolveSnmpConfig } from '../../../../../core/credentials'
import { SnmpClient, describeSnmpTarget } from '../../../../../snmp/engine'
import { resolveOidName, isValidOid } from '../../../../../snmp/mibNames'
import { serializeSnmpValue, type SnmpRawRow } from '../../../../../snmp/preflight'
import { SNMP_CAPTURE_PRESETS } from '../../../../../../shared/constants'

const DEFAULT_MAX_ROWS = 2000
const MAX_MAX_ROWS = 20000
const MAX_GET_OIDS = 64

/**
 * POST /api/monitoring/v1/devices/:id/capture — diagnostic raw SNMP capture
 * (operator tier): run an ad-hoc GET or subtree WALK against a device with
 * its stored credentials and return every varbind untouched (numeric OID,
 * best-effort symbolic name, type, converted value, raw hex for buffers).
 * Nothing is persisted; walks are row-capped and partial results are
 * returned with a `truncated` marker rather than discarded.
 *
 * Body: `{ op: 'walk', oid | preset, max_rows? }` or `{ op: 'get', oids: [] }`.
 */
export default defineEventHandler(async (event) => {
  const user = await requireMonitoring(event, 'operator')
  const db = await monDb()
  const id = idParam(event)
  const body = await readBody(event)

  const op = body?.op === 'get' ? 'get' : body?.op === 'walk' ? 'walk' : null
  if (!op) badRequest("op must be 'walk' or 'get'")

  const res = await db.query('SELECT * FROM monitoring.devices WHERE id = $1', [id])
  const device = res.rows[0]
  if (!device) notFound('device')
  if (device.snmp_disabled) badRequest('SNMP is disabled on this device (ICMP-only)')
  const cfg = await resolveSnmpConfig(db, device)
  if (!cfg) badRequest('device has no usable SNMP configuration')

  const client = new SnmpClient(cfg)
  try {
    const rows: SnmpRawRow[] = []
    let truncated = false
    let note: string | null = null
    let durationMs = 0
    let subject: string

    if (op === 'walk') {
      let oid = String(body?.oid ?? '').trim()
      if (!oid && body?.preset) {
        const preset = SNMP_CAPTURE_PRESETS.find((p) => p.value === body.preset)
        if (!preset) badRequest(`unknown preset "${body.preset}"`)
        oid = preset.oid
      }
      if (!isValidOid(oid)) badRequest('a valid numeric base OID (or preset) is required for walk')
      const maxRows = Math.min(MAX_MAX_ROWS, Math.max(1, Number(body?.max_rows ?? DEFAULT_MAX_ROWS) || DEFAULT_MAX_ROWS))
      subject = oid

      const walk = await client.walk(oid, { maxRows, partial: true })
      if (!walk.ok) {
        return { device_id: id, op, oid, target: describeSnmpTarget(cfg), ok: false, outcome: walk.outcome, error: walk.error, duration_ms: walk.durationMs, rows: [] }
      }
      durationMs = walk.durationMs
      truncated = !!walk.truncated
      note = walk.note ?? null
      for (const row of walk.value) {
        rows.push({ oid: row.oid, name: resolveOidName(row.oid), ...serializeSnmpValue(row.value) })
      }
    } else {
      const oids = Array.isArray(body?.oids) ? body.oids.map((o: unknown) => String(o).trim()).filter(Boolean) : []
      if (!oids.length || oids.length > MAX_GET_OIDS) badRequest(`oids must contain 1–${MAX_GET_OIDS} entries`)
      for (const oid of oids) if (!isValidOid(oid)) badRequest(`invalid OID "${oid}"`)
      subject = oids.join(',')

      const get = await client.get(oids)
      if (!get.ok) {
        return { device_id: id, op, oids, target: describeSnmpTarget(cfg), ok: false, outcome: get.outcome, error: get.error, duration_ms: get.durationMs, rows: [] }
      }
      durationMs = get.durationMs
      for (const oid of oids) {
        rows.push({ oid, name: resolveOidName(oid), ...serializeSnmpValue(get.value[oid] ?? null) })
      }
    }

    await auditMonitoring(user.username, 'device.capture', String(id), `op=${op} oid=${subject.slice(0, 200)} rows=${rows.length}`)
    return {
      device_id: id,
      op,
      target: describeSnmpTarget(cfg),
      ok: true,
      rows,
      row_count: rows.length,
      truncated,
      note,
      duration_ms: durationMs
    }
  } finally {
    client.close()
  }
})
