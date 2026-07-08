import { getDb } from '~~/server/utils/db'
import { nanoid } from 'nanoid'
import { parseCsv } from '~~/layers/monitoring/server/utils/importExport'

interface ImportBody { format?: 'json' | 'csv'; content?: string }

// Bulk-create devices from an uploaded JSON array or CSV (from the Devices
// page's Import button - mirrors the columns export.get.ts produces). Skips
// rows whose IP already exists rather than erroring the whole batch; SNMP
// secrets (auth/priv passwords) are never exported so a round-tripped device
// needs its credentials re-entered on the device's Settings tab.
export default defineEventHandler(async (event) => {
  const body = await readBody<ImportBody>(event)
  let rows: Record<string, any>[] = []
  try {
    rows = body.format === 'csv' ? parseCsv(body.content || '') : JSON.parse(body.content || '[]')
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Could not parse the uploaded file' })
  }
  if (!Array.isArray(rows)) throw createError({ statusCode: 400, statusMessage: 'Expected a list of devices' })

  const db = getDb()
  const existing = new Set((await db.query('SELECT ip FROM net_devices')).rows.map((r) => r.ip))
  let added = 0
  let skipped = 0
  const errors: { row: number; message: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    const hostname = String(r.hostname || '').trim()
    const ip = String(r.ip || '').trim()
    if (!hostname || !ip) { errors.push({ row: i + 1, message: 'hostname and ip are required' }); continue }
    if (existing.has(ip)) { skipped++; continue }

    await db.query(
      `INSERT INTO net_devices
        (id, hostname, ip, type, vendor, os, status, uptime, snmp_version, snmp_community,
         poll_method, category, created_at, snmp_sec_level, snmp_auth_user, snmp_priv_protocol)
       VALUES ($1,$2,$3,$4,$5,$6,'unknown','0 days',$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        nanoid(), hostname.slice(0, 120), ip.slice(0, 120),
        String(r.type || 'Unknown').slice(0, 60), String(r.vendor || 'Unknown').slice(0, 60),
        String(r.os || 'Unknown').slice(0, 100), r.snmp_version || null, r.snmp_community || null,
        r.poll_method || 'ping', r.category || 'network', new Date().toISOString(),
        r.snmp_sec_level || null, r.snmp_auth_user || null, r.snmp_priv_protocol || null
      ]
    )
    existing.add(ip)
    added++
  }

  return { added, skipped, errors }
})
